use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use rust_decimal::Decimal;
use serde::Deserialize;
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use super::PriceUpdate;
use crate::config::Config;
use crate::matcher::TickerMatcher;

const WS_URL: &str = "wss://stream.binance.com:9443/ws";
const REST_URL: &str = "https://api.binance.com/api/v3/exchangeInfo";

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

#[derive(Debug, Deserialize)]
struct BookTickerEvent {
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "b")]
    bid_price: String,
    #[serde(rename = "B")]
    bid_qty: String,
    #[serde(rename = "a")]
    ask_price: String,
    #[serde(rename = "A")]
    ask_qty: String,
}

#[derive(Debug, Deserialize)]
struct StreamWrapper {
    stream: String,
    data: BookTickerEvent,
}

pub async fn connect(
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
) -> Result<()> {
    loop {
        if let Err(e) = run_connection(&config, &matcher, &price_tx).await {
            error!(error = ?e, "Binance connection error, reconnecting in 5s...");
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
    info!(count = symbols.len(), "Binance: fetched symbols");
    
    // Filter USDT pairs (most liquid)
    let usdt_symbols: Vec<_> = symbols
        .iter()
        .filter(|s| s.status == "TRADING" && s.quote_asset == "USDT")
        .take(100) // Top 100 pairs
        .collect();
    
    // Register symbols with matcher
    for sym in &usdt_symbols {
        matcher.register("binance", &sym.symbol);
    }
    
    // Build subscription streams
    let streams: Vec<String> = usdt_symbols
        .iter()
        .map(|s| format!("{}@bookTicker", s.symbol.to_lowercase()))
        .collect();
    
    let ws_url = format!("{}/stream?streams={}", WS_URL.replace("/ws", ""), streams.join("/"));
    
    info!(streams = streams.len(), "Binance: connecting to websocket");
    
    let (ws_stream, _) = connect_async(&ws_url).await?;
    let (mut write, mut read) = ws_stream.split();
    
    info!("Binance: connected");
    
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
                if let Ok(wrapper) = serde_json::from_str::<StreamWrapper>(&text) {
                    let data = wrapper.data;
                    
                    let bid = Decimal::from_str(&data.bid_price).unwrap_or_default();
                    let ask = Decimal::from_str(&data.ask_price).unwrap_or_default();
                    
                    if bid.is_zero() || ask.is_zero() {
                        continue;
                    }
                    
                    let normalized = matcher.register("binance", &data.symbol);
                    
                    let update = PriceUpdate {
                        exchange: "binance".to_string(),
                        symbol: normalized,
                        raw_symbol: data.symbol,
                        bid,
                        ask,
                        bid_size: Decimal::from_str(&data.bid_qty).unwrap_or_default(),
                        ask_size: Decimal::from_str(&data.ask_qty).unwrap_or_default(),
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    };
                    
                    let _ = price_tx.send(update);
                }
            }
            Ok(Message::Pong(_)) => {}
            Ok(Message::Close(_)) => {
                warn!("Binance: connection closed");
                break;
            }
            Err(e) => {
                error!(error = ?e, "Binance: websocket error");
                break;
            }
            _ => {}
        }
    }
    
    ping_handle.abort();
    Ok(())
}

async fn fetch_symbols() -> Result<Vec<SymbolInfo>> {
    let resp: ExchangeInfo = reqwest::get(REST_URL).await?.json().await?;
    Ok(resp.symbols)
}
