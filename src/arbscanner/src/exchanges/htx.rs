// HTX (ex-Huobi) WebSocket connector
// Docs: https://huobiapi.github.io/docs/spot/v1/en/

use anyhow::Result;
use flate2::read::GzDecoder;
use futures_util::{SinkExt, StreamExt};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use super::PriceUpdate;
use crate::config::Config;
use crate::matcher::TickerMatcher;

const WS_URL: &str = "wss://api.huobi.pro/ws";
const REST_URL: &str = "https://api.huobi.pro/v1/common/symbols";

#[derive(Debug, Deserialize)]
struct SymbolsResponse {
    data: Vec<SymbolInfo>,
}

#[derive(Debug, Deserialize)]
struct SymbolInfo {
    symbol: String,
    #[serde(rename = "quote-currency")]
    quote_currency: String,
    state: String,
}

#[derive(Debug, Serialize)]
struct SubscribeMessage {
    sub: String,
    id: String,
}

#[derive(Debug, Serialize)]
struct PongMessage {
    pong: u64,
}

#[derive(Debug, Deserialize)]
struct WsMessage {
    ping: Option<u64>,
    ch: Option<String>,
    tick: Option<TickerData>,
}

#[derive(Debug, Deserialize)]
struct TickerData {
    bid: Option<Decimal>,
    #[serde(rename = "bidSize")]
    bid_size: Option<Decimal>,
    ask: Option<Decimal>,
    #[serde(rename = "askSize")]
    ask_size: Option<Decimal>,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "HTX connection error, reconnecting in 5s...");
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
    info!(count = symbols.len(), "HTX: fetched symbols");

    // Filter USDT pairs
    let usdt_symbols: Vec<_> = symbols
        .iter()
        .filter(|s| s.state == "online" && s.quote_currency == "usdt")
        .take(100)
        .collect();

    // Register symbols with matcher
    for sym in &usdt_symbols {
        // HTX uses lowercase: btcusdt
        matcher.register("htx", &sym.symbol.to_uppercase());
    }

    info!(symbols = usdt_symbols.len(), "HTX: connecting to websocket");

    let (ws_stream, _) = connect_async(WS_URL).await?;
    let (mut write, mut read) = ws_stream.split();

    // Subscribe to BBO (best bid/offer) channels
    for (i, sym) in usdt_symbols.iter().enumerate() {
        let subscribe = SubscribeMessage {
            sub: format!("market.{}.bbo", sym.symbol),
            id: format!("sub_{}", i),
        };

        let sub_msg = serde_json::to_string(&subscribe)?;
        write.send(Message::Text(sub_msg)).await?;
        
        // Small delay to avoid rate limiting
        if i % 10 == 9 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }

    info!("HTX: subscribed to BBO channels");

    // HTX sends binary gzip compressed messages
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Binary(data)) => {
                // Decompress gzip data
                let mut decoder = GzDecoder::new(&data[..]);
                let mut text = String::new();
                if decoder.read_to_string(&mut text).is_err() {
                    continue;
                }

                if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                    // Handle ping/pong (HTX requires pong response)
                    if let Some(ping) = ws_msg.ping {
                        let pong = PongMessage { pong: ping };
                        let pong_msg = serde_json::to_string(&pong)?;
                        write.send(Message::Text(pong_msg)).await?;
                        continue;
                    }

                    // Handle ticker data
                    if let (Some(channel), Some(tick)) = (ws_msg.ch, ws_msg.tick) {
                        // Extract symbol from channel: market.btcusdt.bbo
                        let parts: Vec<&str> = channel.split('.').collect();
                        if parts.len() >= 2 {
                            let symbol = parts[1].to_uppercase();

                            let bid = tick.bid.unwrap_or_default();
                            let ask = tick.ask.unwrap_or_default();

                            if bid.is_zero() || ask.is_zero() {
                                continue;
                            }

                            if let Some(normalized) = matcher.get_normalized("htx", &symbol) {
                                let update = PriceUpdate {
                                    exchange: "htx".to_string(),
                                    symbol: normalized,
                                    raw_symbol: symbol,
                                    bid,
                                    ask,
                                    bid_size: tick.bid_size.unwrap_or_default(),
                                    ask_size: tick.ask_size.unwrap_or_default(),
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                };

                                let _ = price_tx.send(update);
                            }
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                warn!("HTX: connection closed by server");
                break;
            }
            Err(e) => {
                error!(error = ?e, "HTX: websocket error");
                break;
            }
            _ => {}
        }
    }

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
