// Bitget WebSocket connector
// Docs: https://www.bitget.com/api-doc/spot/websocket/public/Tickers-Channel

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

const WS_URL: &str = "wss://ws.bitget.com/v2/ws/public";
const REST_URL: &str = "https://api.bitget.com/api/v2/spot/public/symbols";

#[derive(Debug, Deserialize)]
struct SymbolsResponse {
    data: Vec<SymbolInfo>,
}

#[derive(Debug, Deserialize)]
struct SymbolInfo {
    symbol: String,
    #[serde(rename = "baseCoin")]
    base_coin: String,
    #[serde(rename = "quoteCoin")]
    quote_coin: String,
    status: String,
}

#[derive(Debug, Serialize)]
struct SubscribeMessage {
    op: String,
    args: Vec<SubscribeArg>,
}

#[derive(Debug, Serialize, Clone)]
struct SubscribeArg {
    #[serde(rename = "instType")]
    inst_type: String,
    channel: String,
    #[serde(rename = "instId")]
    inst_id: String,
}

#[derive(Debug, Deserialize)]
struct WsMessage {
    action: Option<String>,
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
    #[serde(rename = "bestBid")]
    best_bid: String,
    #[serde(rename = "bestAsk")]
    best_ask: String,
    #[serde(rename = "bidSz")]
    bid_sz: String,
    #[serde(rename = "askSz")]
    ask_sz: String,
    ts: String,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "Bitget connection error, reconnecting in 5s...");
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
    info!(count = symbols.len(), "Bitget: fetched symbols");

    // Filter USDT pairs
    let usdt_symbols: Vec<_> = symbols
        .iter()
        .filter(|s| s.status == "online" && s.quote_coin == "USDT")
        .take(100)
        .collect();

    // Register symbols with matcher
    for sym in &usdt_symbols {
        // Bitget uses BTCUSDT format
        matcher.register("bitget", &sym.symbol);
    }

    info!(symbols = usdt_symbols.len(), "Bitget: connecting to websocket");

    let (ws_stream, _) = connect_async(WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();

    // Subscribe to ticker channels (max 30 per message)
    for chunk in usdt_symbols.chunks(30) {
        let args: Vec<SubscribeArg> = chunk
            .iter()
            .map(|s| SubscribeArg {
                inst_type: "SPOT".to_string(),
                channel: "ticker".to_string(),
                inst_id: s.symbol.clone(),
            })
            .collect();

        let subscribe = SubscribeMessage {
            op: "subscribe".to_string(),
            args,
        };

        let sub_msg = serde_json::to_string(&subscribe)?;
        write.send(Message::Text(sub_msg)).await?;
    }

    info!("Bitget: subscribed to ticker channels");

    // Ping task - Bitget requires "ping" string
    let ping_write = Arc::new(tokio::sync::Mutex::new(write));
    let ping_write_clone = Arc::clone(&ping_write);
    
    let ping_handle = tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(25)).await;
            let mut writer = ping_write_clone.lock().await;
            if writer.send(Message::Text("ping".to_string())).await.is_err() {
                break;
            }
        }
    });

    // Read messages
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                // Handle pong response
                if text == "pong" {
                    continue;
                }

                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    if let Some(data) = ws_msg.data {
                        for ticker in data {
                            let bid = Decimal::from_str(&ticker.best_bid).unwrap_or_default();
                            let ask = Decimal::from_str(&ticker.best_ask).unwrap_or_default();

                            if bid.is_zero() || ask.is_zero() {
                                continue;
                            }

                            if let Some(normalized) = matcher.get_normalized("bitget", &ticker.inst_id) {
                                let update = PriceUpdate {
                                    exchange: "bitget".to_string(),
                                    symbol: normalized,
                                    raw_symbol: ticker.inst_id.clone(),
                                    bid,
                                    ask,
                                    bid_size: Decimal::from_str(&ticker.bid_sz).unwrap_or_default(),
                                    ask_size: Decimal::from_str(&ticker.ask_sz).unwrap_or_default(),
                                    timestamp: ticker.ts.parse().unwrap_or(0),
                                };

                                let _ = price_tx.send(update);
                            }
                        }
                    }
                }
            }
            Ok(Message::Pong(_)) => {}
            Ok(Message::Close(_)) => {
                warn!("Bitget: connection closed by server");
                break;
            }
            Err(e) => {
                error!(error = ?e, "Bitget: websocket error");
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

    let symbols_resp: SymbolsResponse = response.json().await?;
    Ok(symbols_resp.data)
}
