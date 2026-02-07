use anyhow::Result;
use dashmap::DashMap;
use rust_decimal::Decimal;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, info};

use crate::config::Config;
use crate::exchanges::PriceUpdate;
use crate::matcher::TickerMatcher;
use crate::notifier::Notifier;

/// Arbitrage opportunity
#[derive(Debug, Clone)]
pub struct ArbitrageOpportunity {
    pub symbol: String,
    pub buy_exchange: String,
    pub sell_exchange: String,
    pub buy_price: Decimal,
    pub sell_price: Decimal,
    pub spread_percent: Decimal,
    pub spread_usd: Decimal,
    pub timestamp: i64,
}

/// Scans for arbitrage opportunities across exchanges
pub struct ArbitrageScanner {
    config: Arc<Config>,
    matcher: Arc<TickerMatcher>,
    notifier: Arc<Notifier>,
    price_rx: broadcast::Receiver<PriceUpdate>,
    
    /// Latest prices: Symbol -> Exchange -> PriceUpdate
    prices: DashMap<String, DashMap<String, PriceUpdate>>,
    
    /// Last alert time per opportunity key
    last_alert: DashMap<String, i64>,
}

impl ArbitrageScanner {
    pub fn new(
        config: Arc<Config>,
        matcher: Arc<TickerMatcher>,
        notifier: Arc<Notifier>,
        price_rx: broadcast::Receiver<PriceUpdate>,
    ) -> Self {
        Self {
            config,
            matcher,
            notifier,
            price_rx,
            prices: DashMap::new(),
            last_alert: DashMap::new(),
        }
    }
    
    pub async fn run(mut self) -> Result<()> {
        info!("ArbitrageScanner started");
        
        let mut stats_interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
        
        loop {
            tokio::select! {
                result = self.price_rx.recv() => {
                    match result {
                        Ok(update) => self.handle_price_update(update).await,
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            debug!(skipped = n, "Scanner lagged, skipping messages");
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            break;
                        }
                    }
                }
                _ = stats_interval.tick() => {
                    self.log_stats();
                }
            }
        }
        
        Ok(())
    }
    
    async fn handle_price_update(&self, update: PriceUpdate) {
        // Store latest price
        self.prices
            .entry(update.symbol.clone())
            .or_insert_with(DashMap::new)
            .insert(update.exchange.clone(), update.clone());
        
        // Check for arbitrage on this symbol
        if let Some(opportunity) = self.find_arbitrage(&update.symbol) {
            // Check cooldown
            let key = format!(
                "{}-{}-{}",
                opportunity.symbol, opportunity.buy_exchange, opportunity.sell_exchange
            );
            
            let now = chrono::Utc::now().timestamp_millis();
            let last = self.last_alert.get(&key).map(|v| *v).unwrap_or(0);
            
            if now - last >= self.config.cooldown_ms as i64 {
                self.last_alert.insert(key, now);
                
                info!(
                    symbol = %opportunity.symbol,
                    buy = %opportunity.buy_exchange,
                    sell = %opportunity.sell_exchange,
                    spread = %opportunity.spread_percent,
                    "Arbitrage opportunity found!"
                );
                
                // Send notification
                self.notifier.notify(opportunity).await;
            }
        }
    }
    
    fn find_arbitrage(&self, symbol: &str) -> Option<ArbitrageOpportunity> {
        let prices = self.prices.get(symbol)?;
        
        if prices.len() < 2 {
            return None;
        }
        
        // Find best bid (highest) and best ask (lowest) across exchanges
        let mut best_bid: Option<(String, Decimal)> = None;
        let mut best_ask: Option<(String, Decimal)> = None;
        
        for entry in prices.iter() {
            let exchange = entry.key().clone();
            let update = entry.value();
            
            // Check filter
            if !self.config.filter_exchanges.is_empty() 
                && !self.config.filter_exchanges.contains(&exchange.to_lowercase()) 
            {
                continue;
            }
            
            // Best bid = highest bid (where we can sell)
            if best_bid.is_none() || update.bid > best_bid.as_ref().unwrap().1 {
                best_bid = Some((exchange.clone(), update.bid));
            }
            
            // Best ask = lowest ask (where we can buy)
            if best_ask.is_none() || update.ask < best_ask.as_ref().unwrap().1 {
                best_ask = Some((exchange, update.ask));
            }
        }
        
        let (sell_exchange, sell_price) = best_bid?;
        let (buy_exchange, buy_price) = best_ask?;
        
        // No arbitrage if same exchange
        if sell_exchange == buy_exchange {
            return None;
        }
        
        // Calculate spread: (sell_price - buy_price) / buy_price * 100
        if buy_price.is_zero() {
            return None;
        }
        
        let spread_usd = sell_price - buy_price;
        let spread_percent = (spread_usd / buy_price) * Decimal::from(100);
        
        // Check thresholds
        if spread_percent < self.config.min_spread_percent {
            return None;
        }
        
        if spread_percent > self.config.max_spread_percent {
            return None;
        }
        
        // Check pair filter
        if !self.config.filter_pairs.is_empty() {
            let base = symbol.split('/').next().unwrap_or("");
            if !self.config.filter_pairs.iter().any(|p| base.contains(p) || p.contains(base)) {
                return None;
            }
        }
        
        Some(ArbitrageOpportunity {
            symbol: symbol.to_string(),
            buy_exchange,
            sell_exchange,
            buy_price,
            sell_price,
            spread_percent,
            spread_usd,
            timestamp: chrono::Utc::now().timestamp_millis(),
        })
    }
    
    fn log_stats(&self) {
        let symbols = self.prices.len();
        let total_prices: usize = self.prices.iter().map(|e| e.value().len()).sum();
        let arbitrageable = self.matcher.get_arbitrageable_symbols().len();
        
        info!(
            symbols,
            total_prices,
            arbitrageable,
            "Scanner stats"
        );
        
        self.matcher.log_stats();
    }
}
