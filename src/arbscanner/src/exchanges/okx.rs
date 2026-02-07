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

const WS_URL: &str = "wss://ws.okx.com:8443/ws/v5/public";
const REST_URL: &str = "https://www.okx.com/api/v5/public/instruments?instType=SPOT";

#[derive(Debug, Deserialize)]
struct InstrumentsResponse {
    data: Vec<Instrument>,
}

#[derive(Debug, Deserialize)]
struct Instrument {
    #[serde(rename = "instId")]
    inst_id: String,
    state: String,
    #[serde(rename = "quoteCcy")]
    quote_ccy: String,
}

#[derive(Debug, Serialize)]
struct SubscribeRequest {
    op: String,
    args: Vec<SubscribeArg>,
}

#[derive(Debug, Clone, Serialize)]
struct SubscribeArg {
    channel: String,
    #[serde(rename = "instId")]
    inst_id: String,
}

#[derive(Debug, Deserialize)]
struct WsMessage {
    arg: Option<WsArg>,
    data: Option<Vec<TickerData>>,
}

#[derive(Debug, Deserialize)]
struct WsArg {
    channel: String,
    #[serde(rename = "instId")]
    inst_id: String,
}

#[derive(Debug, Deserialize)]
struct TickerData {
    #[serde(rename = "instId")]
    inst_id: String,
    #[serde(rename = "bidPx")]
    bid_price: String,
    #[serde(rename = "bidSz")]
    bid_size: String,
    #[serde(rename = "askPx")]
    ask_price: String,
    #[serde(rename = "askSz")]
    ask_size: String,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "OKX connection error, reconnecting in 5s...");
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }
}

async fn run_connection(
    _config: &Config,
    matcher: &TickerMatcher,
    price_tx: &broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    let symbols = fetch_symbols().await?;
    info!(count = symbols.len(), "OKX: fetched symbols");
    
    let usdt_symbols: Vec<_> = symbols
        .iter()
        .filter(|s| s.state == "live" && s.quote_ccy == "USDT")
        .take(100)
        .collect();
    
    for sym in &usdt_symbols {
        matcher.register("okx", &sym.inst_id);
    }
    
    let (ws_stream, _) = connect_async(WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();
    
    info!("OKX: connected");
    
    // Subscribe in batches
    let args: Vec<SubscribeArg> = usdt_symbols
        .iter()
        .map(|s| SubscribeArg {
            channel: "tickers".to_string(),
            inst_id: s.inst_id.clone(),
        })
        .collect();
    
    for chunk in args.chunks(50) {
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
            tokio::time::sleep(tokio::time::Duration::from_secs(25)).await;
            if write_clone.lock().await.send(Message::Text("ping".to_string())).await.is_err() {
                break;
            }
        }
    });
    
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if text == "pong" {
                    continue;
                }
                
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if let Some(data_vec) = ws_msg.data {
                        for data in data_vec {
                            let bid = Decimal::from_str(&data.bid_price).unwrap_or_default();
                            let ask = Decimal::from_str(&data.ask_price).unwrap_or_default();
                            
                            if bid.is_zero() || ask.is_zero() {
                                continue;
                            }
                            
                            let normalized = matcher.register("okx", &data.inst_id);
                            
                            let update = PriceUpdate {
                                exchange: "okx".to_string(),
                                symbol: normalized,
                                raw_symbol: data.inst_id,
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
                warn!("OKX: connection closed");
                break;
            }
            Err(e) => {
                error!(error = ?e, "OKX: websocket error");
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
    Ok(resp.data)
}
