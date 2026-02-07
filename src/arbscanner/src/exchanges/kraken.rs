// Kraken exchange connector
// WebSocket docs: https://docs.kraken.com/websockets-v2/

use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use super::PriceUpdate;
use crate::config::Config;
use crate::matcher::TickerMatcher;

const WS_URL: &str = "wss://ws.kraken.com/v2";

#[derive(Debug, Serialize)]
struct SubscribeRequest {
    method: String,
    params: SubscribeParams,
}

#[derive(Debug, Serialize)]
struct SubscribeParams {
    channel: String,
    symbol: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum WsMessage {
    Ticker(TickerMessage),
    Other(serde_json::Value),
}

#[derive(Debug, Deserialize)]
struct TickerMessage {
    channel: Option<String>,
    data: Option<Vec<TickerData>>,
}

#[derive(Debug, Deserialize)]
struct TickerData {
    symbol: String,
    bid: Decimal,
    bid_qty: Decimal,
    ask: Decimal,
    ask_qty: Decimal,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "Kraken connection error, reconnecting in 5s...");
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }
}

async fn run_connection(
    _config: &Config,
    matcher: &TickerMatcher,
    price_tx: &broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    let (ws_stream, _) = connect_async(WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();
    
    info!("Kraken: connected");
    
    // Popular USDT pairs on Kraken
    let symbols = vec![
        "BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "DOGE/USD",
        "ADA/USD", "AVAX/USD", "DOT/USD", "LINK/USD", "MATIC/USD",
        "BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT",
    ];
    
    for sym in &symbols {
        matcher.register("kraken", sym);
    }
    
    let sub = SubscribeRequest {
        method: "subscribe".to_string(),
        params: SubscribeParams {
            channel: "ticker".to_string(),
            symbol: symbols.iter().map(|s| s.to_string()).collect(),
        },
    };
    
    write.send(Message::Text(serde_json::to_string(&sub)?)).await?;
    
    // Ping task
    let write = Arc::new(tokio::sync::Mutex::new(write));
    let write_clone = write.clone();
    let ping_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            let ping = serde_json::json!({"method": "ping"});
            if write_clone.lock().await.send(Message::Text(ping.to_string())).await.is_err() {
                break;
            }
        }
    });
    
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(WsMessage::Ticker(ticker)) = serde_json::from_str(&text) {
                    if let (Some(channel), Some(data_vec)) = (ticker.channel, ticker.data) {
                        if channel == "ticker" {
                            for data in data_vec {
                                if data.bid.is_zero() || data.ask.is_zero() {
                                    continue;
                                }
                                
                                let normalized = matcher.register("kraken", &data.symbol);
                                
                                let update = PriceUpdate {
                                    exchange: "kraken".to_string(),
                                    symbol: normalized,
                                    raw_symbol: data.symbol,
                                    bid: data.bid,
                                    ask: data.ask,
                                    bid_size: data.bid_qty,
                                    ask_size: data.ask_qty,
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                };
                                
                                let _ = price_tx.send(update);
                            }
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                warn!("Kraken: connection closed");
                break;
            }
            Err(e) => {
                error!(error = ?e, "Kraken: websocket error");
                break;
            }
            _ => {}
        }
    }
    
    ping_handle.abort();
    Ok(())
}
