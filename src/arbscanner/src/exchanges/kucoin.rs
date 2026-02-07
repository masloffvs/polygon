// KuCoin exchange connector
// Docs: https://docs.kucoin.com/

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

const REST_URL: &str = "https://api.kucoin.com/api/v1/bullet-public";
const SYMBOLS_URL: &str = "https://api.kucoin.com/api/v2/symbols";

#[derive(Debug, Deserialize)]
struct BulletResponse {
    data: BulletData,
}

#[derive(Debug, Deserialize)]
struct BulletData {
    token: String,
    #[serde(rename = "instanceServers")]
    instance_servers: Vec<InstanceServer>,
}

#[derive(Debug, Deserialize)]
struct InstanceServer {
    endpoint: String,
    #[serde(rename = "pingInterval")]
    ping_interval: u64,
}

#[derive(Debug, Deserialize)]
struct SymbolsResponse {
    data: Vec<Symbol>,
}

#[derive(Debug, Deserialize)]
struct Symbol {
    symbol: String,
    #[serde(rename = "quoteCurrency")]
    quote_currency: String,
    #[serde(rename = "enableTrading")]
    enable_trading: bool,
}

#[derive(Debug, Serialize)]
struct SubscribeRequest {
    id: String,
    #[serde(rename = "type")]
    msg_type: String,
    topic: String,
    #[serde(rename = "privateChannel")]
    private_channel: bool,
    response: bool,
}

#[derive(Debug, Deserialize)]
struct WsMessage {
    #[serde(rename = "type")]
    msg_type: Option<String>,
    topic: Option<String>,
    data: Option<TickerData>,
}

#[derive(Debug, Deserialize)]
struct TickerData {
    #[serde(rename = "bestBid")]
    best_bid: String,
    #[serde(rename = "bestBidSize")]
    best_bid_size: String,
    #[serde(rename = "bestAsk")]
    best_ask: String,
    #[serde(rename = "bestAskSize")]
    best_ask_size: String,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "KuCoin connection error, reconnecting in 5s...");
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        }
    }
}

async fn run_connection(
    _config: &Config,
    matcher: &TickerMatcher,
    price_tx: &broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    // Get WebSocket token
    let bullet: BulletResponse = reqwest::Client::new()
        .post(REST_URL)
        .send()
        .await?
        .json()
        .await?;
    
    let server = &bullet.data.instance_servers[0];
    let ws_url = format!("{}?token={}", server.endpoint, bullet.data.token);
    let ping_interval = server.ping_interval;
    
    // Fetch symbols
    let symbols_resp: SymbolsResponse = reqwest::get(SYMBOLS_URL).await?.json().await?;
    let usdt_symbols: Vec<_> = symbols_resp.data
        .iter()
        .filter(|s| s.enable_trading && s.quote_currency == "USDT")
        .take(100)
        .collect();
    
    info!(count = usdt_symbols.len(), "KuCoin: fetched symbols");
    
    for sym in &usdt_symbols {
        matcher.register("kucoin", &sym.symbol);
    }
    
    let (ws_stream, _) = connect_async(&ws_url).await?;
    let (mut write, mut read) = ws_stream.split();
    
    info!("KuCoin: connected");
    
    // Subscribe to ticker
    let topic = format!(
        "/market/ticker:{}",
        usdt_symbols.iter().map(|s| s.symbol.as_str()).collect::<Vec<_>>().join(",")
    );
    
    let sub = SubscribeRequest {
        id: "arbscanner".to_string(),
        msg_type: "subscribe".to_string(),
        topic,
        private_channel: false,
        response: false,
    };
    
    write.send(Message::Text(serde_json::to_string(&sub)?)).await?;
    
    // Ping task
    let write = Arc::new(tokio::sync::Mutex::new(write));
    let write_clone = write.clone();
    let ping_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(ping_interval)).await;
            let ping = serde_json::json!({"id": "ping", "type": "ping"});
            if write_clone.lock().await.send(Message::Text(ping.to_string())).await.is_err() {
                break;
            }
        }
    });
    
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if let (Some(topic), Some(data)) = (ws_msg.topic, ws_msg.data) {
                        // Topic format: /market/ticker:BTC-USDT
                        let symbol = topic.split(':').last().unwrap_or_default();
                        
                        let bid = Decimal::from_str(&data.best_bid).unwrap_or_default();
                        let ask = Decimal::from_str(&data.best_ask).unwrap_or_default();
                        
                        if bid.is_zero() || ask.is_zero() {
                            continue;
                        }
                        
                        let normalized = matcher.register("kucoin", symbol);
                        
                        let update = PriceUpdate {
                            exchange: "kucoin".to_string(),
                            symbol: normalized,
                            raw_symbol: symbol.to_string(),
                            bid,
                            ask,
                            bid_size: Decimal::from_str(&data.best_bid_size).unwrap_or_default(),
                            ask_size: Decimal::from_str(&data.best_ask_size).unwrap_or_default(),
                            timestamp: chrono::Utc::now().timestamp_millis(),
                        };
                        
                        let _ = price_tx.send(update);
                    }
                }
            }
            Ok(Message::Close(_)) => {
                warn!("KuCoin: connection closed");
                break;
            }
            Err(e) => {
                error!(error = ?e, "KuCoin: websocket error");
                break;
            }
            _ => {}
        }
    }
    
    ping_handle.abort();
    Ok(())
}
