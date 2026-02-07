// Gate.io exchange connector
// Docs: https://www.gate.io/docs/developers/apiv4/ws/en/

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

const WS_URL: &str = "wss://api.gateio.ws/ws/v4/";
const REST_URL: &str = "https://api.gateio.ws/api/v4/spot/currency_pairs";

#[derive(Debug, Deserialize)]
struct CurrencyPair {
    id: String,
    quote: String,
    trade_status: String,
}

#[derive(Debug, Serialize)]
struct SubscribeRequest {
    time: i64,
    channel: String,
    event: String,
    payload: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct WsMessage {
    channel: Option<String>,
    event: Option<String>,
    result: Option<TickerResult>,
}

#[derive(Debug, Deserialize)]
struct TickerResult {
    currency_pair: String,
    highest_bid: String,
    lowest_ask: String,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "Gate.io connection error, reconnecting in 5s...");
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }
}

async fn run_connection(
    _config: &Config,
    matcher: &TickerMatcher,
    price_tx: &broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    let pairs: Vec<CurrencyPair> = reqwest::get(REST_URL).await?.json().await?;
    let usdt_pairs: Vec<_> = pairs
        .iter()
        .filter(|p| p.trade_status == "tradable" && p.quote == "USDT")
        .take(100)
        .collect();
    
    info!(count = usdt_pairs.len(), "Gate.io: fetched symbols");
    
    for pair in &usdt_pairs {
        matcher.register("gate", &pair.id);
    }
    
    let (ws_stream, _) = connect_async(WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();
    
    info!("Gate.io: connected");
    
    // Subscribe in batches
    for chunk in usdt_pairs.chunks(20) {
        let sub = SubscribeRequest {
            time: chrono::Utc::now().timestamp(),
            channel: "spot.tickers".to_string(),
            event: "subscribe".to_string(),
            payload: chunk.iter().map(|p| p.id.clone()).collect(),
        };
        write.send(Message::Text(serde_json::to_string(&sub)?)).await?;
    }
    
    // Ping task
    let write = Arc::new(tokio::sync::Mutex::new(write));
    let write_clone = write.clone();
    let ping_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
            let ping = serde_json::json!({
                "time": chrono::Utc::now().timestamp(),
                "channel": "spot.ping"
            });
            if write_clone.lock().await.send(Message::Text(ping.to_string())).await.is_err() {
                break;
            }
        }
    });
    
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if let (Some(channel), Some(event), Some(result)) = 
                        (ws_msg.channel, ws_msg.event, ws_msg.result) 
                    {
                        if channel == "spot.tickers" && event == "update" {
                            let bid = Decimal::from_str(&result.highest_bid).unwrap_or_default();
                            let ask = Decimal::from_str(&result.lowest_ask).unwrap_or_default();
                            
                            if bid.is_zero() || ask.is_zero() {
                                continue;
                            }
                            
                            let normalized = matcher.register("gate", &result.currency_pair);
                            
                            let update = PriceUpdate {
                                exchange: "gate".to_string(),
                                symbol: normalized,
                                raw_symbol: result.currency_pair,
                                bid,
                                ask,
                                bid_size: Decimal::ZERO, // Gate doesn't send size in ticker
                                ask_size: Decimal::ZERO,
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            };
                            
                            let _ = price_tx.send(update);
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                warn!("Gate.io: connection closed");
                break;
            }
            Err(e) => {
                error!(error = ?e, "Gate.io: websocket error");
                break;
            }
            _ => {}
        }
    }
    
    ping_handle.abort();
    Ok(())
}
