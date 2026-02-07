// MEXC WebSocket connector
// Docs: https://mexcdevelop.github.io/apidocs/spot_v3_en/

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

const WS_URL: &str = "wss://wbs.mexc.com/ws";
const REST_URL: &str = "https://api.mexc.com/api/v3/exchangeInfo";

#[derive(Debug, Deserialize)]
struct ExchangeInfo {
    symbols: Vec<SymbolInfo>,
}

#[derive(Debug, Deserialize)]
struct SymbolInfo {
    symbol: String,
    status: String,
    #[serde(rename = "quoteAsset")]
    quote_asset: String,
}

#[derive(Debug, Serialize)]
struct SubscribeMessage {
    method: String,
    params: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct WsMessage {
    c: Option<String>,  // channel
    d: Option<TickerData>,
    s: Option<String>,  // symbol (for some message types)
}

#[derive(Debug, Deserialize)]
struct TickerData {
    #[serde(rename = "a")]
    ask_price: Option<String>,
    #[serde(rename = "A")]
    ask_qty: Option<String>,
    #[serde(rename = "b")]
    bid_price: Option<String>,
    #[serde(rename = "B")]
    bid_qty: Option<String>,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "MEXC connection error, reconnecting in 5s...");
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }
}

async fn run_connection(
    _config: &Config,
    matcher: &TickerMatcher,
    price_tx: &broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    // Fetch available symbols
    let symbols = fetch_symbols().await?;
    info!(count = symbols.len(), "MEXC: fetched symbols");

    // Filter USDT pairs
    let usdt_symbols: Vec<_> = symbols
        .iter()
        .filter(|s| s.status == "ENABLED" && s.quote_asset == "USDT")
        .take(100)
        .collect();

    // Register symbols with matcher
    for sym in &usdt_symbols {
        matcher.register("mexc", &sym.symbol);
    }

    info!(symbols = usdt_symbols.len(), "MEXC: connecting to websocket");

    let (ws_stream, _) = connect_async(WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();

    // Subscribe to book ticker streams
    let params: Vec<String> = usdt_symbols
        .iter()
        .map(|s| format!("spot@public.bookTicker.v3.api@{}", s.symbol))
        .collect();

    let subscribe = SubscribeMessage {
        method: "SUBSCRIPTION".to_string(),
        params,
    };

    let sub_msg = serde_json::to_string(&subscribe)?;
    write.send(Message::Text(sub_msg)).await?;

    info!("MEXC: subscribed to book ticker channels");

    // Ping task
    let ping_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(20)).await;
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
                    if let (Some(channel), Some(data)) = (ws_msg.c, ws_msg.d) {
                        // Extract symbol from channel: spot@public.bookTicker.v3.api@BTCUSDT
                        if let Some(symbol) = channel.split('@').last() {
                            let bid = data
                                .bid_price
                                .as_ref()
                                .and_then(|b| Decimal::from_str(b).ok())
                                .unwrap_or_default();
                            let ask = data
                                .ask_price
                                .as_ref()
                                .and_then(|a| Decimal::from_str(a).ok())
                                .unwrap_or_default();

                            if bid.is_zero() || ask.is_zero() {
                                continue;
                            }

                            if let Some(normalized) = matcher.get_normalized("mexc", symbol) {
                                let update = PriceUpdate {
                                    exchange: "mexc".to_string(),
                                    symbol: normalized,
                                    raw_symbol: symbol.to_string(),
                                    bid,
                                    ask,
                                    bid_size: data
                                        .bid_qty
                                        .as_ref()
                                        .and_then(|q| Decimal::from_str(q).ok())
                                        .unwrap_or_default(),
                                    ask_size: data
                                        .ask_qty
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
            Ok(Message::Pong(_)) => {}
            Ok(Message::Close(_)) => {
                warn!("MEXC: connection closed by server");
                break;
            }
            Err(e) => {
                error!(error = ?e, "MEXC: websocket error");
                break;
            }
            _ => {}
        }
    }

    ping_handle.abort();
    Ok(())
}

async fn fetch_symbols() -> Result<Vec<SymbolInfo>> {
    let client = reqwest::Client::new();
    let response = client
        .get(REST_URL)
        .header("User-Agent", "arbscanner/1.0")
        .send()
        .await?;

    let exchange_info: ExchangeInfo = response.json().await?;
    Ok(exchange_info.symbols)
}
