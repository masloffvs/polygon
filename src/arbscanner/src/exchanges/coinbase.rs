// Coinbase Advanced Trade WebSocket connector
// Docs: https://docs.cdp.coinbase.com/advanced-trade/docs/ws-overview

use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use super::PriceUpdate;
use crate::config::Config;
use crate::matcher::TickerMatcher;

const WS_URL: &str = "wss://advanced-trade-ws.coinbase.com";
const REST_URL: &str = "https://api.exchange.coinbase.com/products";

#[derive(Debug, Deserialize)]
struct Product {
    id: String,
    base_currency: String,
    quote_currency: String,
    status: String,
}

#[derive(Debug, Serialize)]
struct SubscribeMessage {
    #[serde(rename = "type")]
    msg_type: String,
    product_ids: Vec<String>,
    channel: String,
}

#[derive(Debug, Deserialize)]
struct WsMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(default)]
    events: Vec<TickerEvent>,
}

#[derive(Debug, Deserialize)]
struct TickerEvent {
    #[serde(rename = "type")]
    event_type: Option<String>,
    tickers: Option<Vec<TickerData>>,
}

#[derive(Debug, Deserialize)]
struct TickerData {
    product_id: String,
    price: Option<String>,
    best_bid: Option<String>,
    best_ask: Option<String>,
    best_bid_quantity: Option<String>,
    best_ask_quantity: Option<String>,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "Coinbase connection error, reconnecting in 5s...");
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }
}

async fn run_connection(
    _config: &Config,
    matcher: &TickerMatcher,
    price_tx: &broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    // Fetch available products
    let products = fetch_products().await?;
    info!(count = products.len(), "Coinbase: fetched products");

    // Filter USD pairs (most liquid on Coinbase)
    let usd_products: Vec<_> = products
        .iter()
        .filter(|p| p.status == "online" && (p.quote_currency == "USD" || p.quote_currency == "USDT"))
        .take(50)
        .collect();

    // Register symbols with matcher
    for product in &usd_products {
        // Coinbase uses BTC-USD format
        matcher.register("coinbase", &product.id);
    }

    let product_ids: Vec<String> = usd_products.iter().map(|p| p.id.clone()).collect();

    info!(products = product_ids.len(), "Coinbase: connecting to websocket");

    let (ws_stream, _) = connect_async(WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();

    // Subscribe to ticker channel
    let subscribe = SubscribeMessage {
        msg_type: "subscribe".to_string(),
        product_ids: product_ids.clone(),
        channel: "ticker".to_string(),
    };

    let sub_msg = serde_json::to_string(&subscribe)?;
    write.send(Message::Text(sub_msg)).await?;

    info!("Coinbase: subscribed to ticker channel");

    // Ping task
    let ping_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            if write.send(Message::Ping(vec![])).await.is_err() {
                break;
            }
        }
    });

    // Read messages
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if ws_msg.msg_type == "ticker" {
                        for event in ws_msg.events {
                            if let Some(tickers) = event.tickers {
                                for ticker in tickers {
                                    let bid = ticker
                                        .best_bid
                                        .as_ref()
                                        .and_then(|b| Decimal::from_str(b).ok())
                                        .unwrap_or_default();
                                    let ask = ticker
                                        .best_ask
                                        .as_ref()
                                        .and_then(|a| Decimal::from_str(a).ok())
                                        .unwrap_or_default();

                                    if bid.is_zero() || ask.is_zero() {
                                        continue;
                                    }

                                    if let Some(normalized) = matcher.get_normalized("coinbase", &ticker.product_id) {
                                        let update = PriceUpdate {
                                            exchange: "coinbase".to_string(),
                                            symbol: normalized,
                                            raw_symbol: ticker.product_id.clone(),
                                            bid,
                                            ask,
                                            bid_size: ticker
                                                .best_bid_quantity
                                                .as_ref()
                                                .and_then(|q| Decimal::from_str(q).ok())
                                                .unwrap_or_default(),
                                            ask_size: ticker
                                                .best_ask_quantity
                                                .as_ref()
                                                .and_then(|q| Decimal::from_str(q).ok())
                                                .unwrap_or_default(),
                                            timestamp: chrono::Utc::now().timestamp_millis(),
                                        };

                                        let _ = price_tx.send(update);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(Message::Pong(_)) => {}
            Ok(Message::Close(_)) => {
                warn!("Coinbase: connection closed by server");
                break;
            }
            Err(e) => {
                error!(error = ?e, "Coinbase: websocket error");
                break;
            }
            _ => {}
        }
    }

    ping_handle.abort();
    Ok(())
}

async fn fetch_products() -> Result<Vec<Product>> {
    let client = reqwest::Client::new();
    let response = client
        .get(REST_URL)
        .header("User-Agent", "arbscanner/1.0")
        .send()
        .await?;

    let products: Vec<Product> = response.json().await?;
    Ok(products)
}
