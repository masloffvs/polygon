mod binance;
mod bybit;
mod okx;
mod kraken;
mod kucoin;
mod gate;
mod mexc;
mod htx;
mod bitget;
mod coinbase;

use anyhow::Result;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::config::Config;
use crate::matcher::TickerMatcher;

/// Price update from any exchange
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceUpdate {
    pub exchange: String,
    pub symbol: String,           // Normalized symbol
    pub raw_symbol: String,       // Original exchange symbol
    pub bid: Decimal,             // Best bid
    pub ask: Decimal,             // Best ask
    pub bid_size: Decimal,
    pub ask_size: Decimal,
    pub timestamp: i64,
}

impl PriceUpdate {
    pub fn mid_price(&self) -> Decimal {
        (self.bid + self.ask) / Decimal::from(2)
    }
}

/// Manages all exchange connections
pub struct ExchangeManager {
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    price_tx: broadcast::Sender<PriceUpdate>,
}

impl ExchangeManager {
    pub fn new(
        config: Arc<Config>,
        matcher: Arc<TickerMatcher>,
        price_tx: broadcast::Sender<PriceUpdate>,
    ) -> Self {
        Self {
            config,
            matcher,
            price_tx,
        }
    }
    
    pub async fn run(self) -> Result<()> {
        let mut handles = Vec::new();
        
        // Spawn each enabled exchange
        if self.config.is_exchange_enabled("binance") {
            let h = tokio::spawn(binance::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("binance", h));
        }
        
        if self.config.is_exchange_enabled("bybit") {
            let h = tokio::spawn(bybit::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("bybit", h));
        }
        
        if self.config.is_exchange_enabled("okx") {
            let h = tokio::spawn(okx::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("okx", h));
        }
        
        if self.config.is_exchange_enabled("kraken") {
            let h = tokio::spawn(kraken::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("kraken", h));
        }
        
        if self.config.is_exchange_enabled("kucoin") {
            let h = tokio::spawn(kucoin::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("kucoin", h));
        }
        
        if self.config.is_exchange_enabled("gate") {
            let h = tokio::spawn(gate::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("gate", h));
        }
        
        if self.config.is_exchange_enabled("mexc") {
            let h = tokio::spawn(mexc::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("mexc", h));
        }
        
        if self.config.is_exchange_enabled("htx") {
            let h = tokio::spawn(htx::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("htx", h));
        }
        
        if self.config.is_exchange_enabled("bitget") {
            let h = tokio::spawn(bitget::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("bitget", h));
        }
        
        if self.config.is_exchange_enabled("coinbase") {
            let h = tokio::spawn(coinbase::connect(
                self.config.clone(),
                self.matcher.clone(),
                self.price_tx.clone(),
            ));
            handles.push(("coinbase", h));
        }
        
        info!(count = handles.len(), "Started exchange connections");
        
        // Wait for all to complete (they shouldn't unless error)
        for (name, handle) in handles {
            match handle.await {
                Ok(Ok(())) => info!(exchange = name, "Exchange stopped gracefully"),
                Ok(Err(e)) => warn!(exchange = name, error = ?e, "Exchange error"),
                Err(e) => warn!(exchange = name, error = ?e, "Exchange task panicked"),
            }
        }
        
        Ok(())
    }
}

/// Common trait for exchange implementations
pub trait Exchange {
    fn name(&self) -> &'static str;
    fn ws_url(&self) -> &str;
}
