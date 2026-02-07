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

const WS_URL: &str = "wss://stream.bybit.com/v5/public/spot";
const REST_URL: &str = "https://api.bybit.com/v5/market/instruments-info?category=spot";

#[derive(Debug, Deserialize)]
struct InstrumentsResponse {
    result: InstrumentsResult,
}

#[derive(Debug, Deserialize)]
struct InstrumentsResult {
    list: Vec<Instrument>,
}

#[derive(Debug, Deserialize)]
struct Instrument {
    symbol: String,
    status: String,
    #[serde(rename = "quoteCoin")]
    quote_coin: String,
}

#[derive(Debug, Serialize)]
struct SubscribeRequest {
    op: String,
    args: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct WsMessage {
    topic: Option<String>,
    data: Option<TickerData>,
}

#[derive(Debug, Deserialize)]
struct TickerData {
    symbol: String,
    #[serde(rename = "bid1Price")]
    bid_price: String,
    #[serde(rename = "bid1Size")]
    bid_size: String,
    #[serde(rename = "ask1Price")]
    ask_price: String,
    #[serde(rename = "ask1Size")]
    ask_size: String,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "Bybit connection error, reconnecting in 5s...");
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
    info!(count = symbols.len(), "Bybit: fetched symbols");
    
    // Filter USDT pairs
    let usdt_symbols: Vec<_> = symbols
        .iter()
        .filter(|s| s.status == "Trading" && s.quote_coin == "USDT")
        .take(100)
        .collect();
    
    // Register with matcher
    for sym in &usdt_symbols {
        matcher.register("bybit", &sym.symbol);
    }
    
    let (ws_stream, _) = connect_async(WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();
    
    info!("Bybit: connected");
    
    // Subscribe to tickers
    let args: Vec<String> = usdt_symbols
        .iter()
        .map(|s| format!("tickers.{}", s.symbol))
        .collect();
    
    // Bybit limits subscriptions per message
    for chunk in args.chunks(10) {
        let sub = SubscribeRequest {
            op: "subscribe".to_string(),
            args: chunk.to_vec(),
        };
        write.send(Message::Text(serde_json::to_string(&sub)?)).await?;
    }
    
    // Ping task
    let write = Arc::new(tokio::sync::Mutex::new(write));
    let write_clone = write.clone();
    let ping_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(20)).await;
            let ping = serde_json::json!({"op": "ping"});
            if write_clone.lock().await.send(Message::Text(ping.to_string())).await.is_err() {
                break;
            }
        }
    });
    
    // Read messages
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if let (Some(topic), Some(data)) = (ws_msg.topic, ws_msg.data) {
                        if topic.starts_with("tickers.") {
                            let bid = Decimal::from_str(&data.bid_price).unwrap_or_default();
                            let ask = Decimal::from_str(&data.ask_price).unwrap_or_default();
                            
                            if bid.is_zero() || ask.is_zero() {
                                continue;
                            }
                            
                            let normalized = matcher.register("bybit", &data.symbol);
                            
                            let update = PriceUpdate {
                                exchange: "bybit".to_string(),
                                symbol: normalized,
                                raw_symbol: data.symbol,
                                bid,
                                ask,
                                bid_size: Decimal::from_str(&data.bid_size).unwrap_or_default(),
                                ask_size: Decimal::from_str(&data.ask_size).unwrap_or_default(),
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            };
                            
                            let _ = price_tx.send(update);
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                warn!("Bybit: connection closed");
                break;
            }
            Err(e) => {
                error!(error = ?e, "Bybit: websocket error");
                break;
            }
            _ => {}
        }
    }
    
    ping_handle.abort();
    Ok(())
}

async fn fetch_symbols() -> Result<Vec<Instrument>> {
    let resp: InstrumentsResponse = reqwest::get(REST_URL).await?.json().await?;
    Ok(resp.result.list)
}
