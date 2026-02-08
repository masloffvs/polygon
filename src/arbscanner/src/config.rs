use anyhow::{Result, Context};
use rust_decimal::Decimal;
use std::str::FromStr;

#[derive(Debug, Clone)]
pub struct Config {
    /// Minimum spread % to trigger alert (e.g., 0.3 = 0.3%)
    pub min_spread_percent: Decimal,
    
    /// Maximum spread % (filter anomalies)
    pub max_spread_percent: Decimal,
    
    /// Cooldown between alerts for same pair (ms)
    pub cooldown_ms: u64,
    
    /// URL to send arbitrage alerts to
    pub callback_url: String,
    
    /// Optional: filter specific pairs (comma-separated, e.g., "BTC,ETH,SOL")
    pub filter_pairs: Vec<String>,
    
    /// Optional: filter specific exchanges
    pub filter_exchanges: Vec<String>,
    
    /// Enabled exchanges (comma-separated)
    pub enabled_exchanges: Vec<String>,
    
    /// Number of top orderbook levels to track
    pub orderbook_depth: usize,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();
        
        let min_spread = std::env::var("MIN_SPREAD_PERCENT")
            .unwrap_or_else(|_| "0.8".to_string());
        let max_spread = std::env::var("MAX_SPREAD_PERCENT")
            .unwrap_or_else(|_| "10.0".to_string());
        let cooldown = std::env::var("COOLDOWN_MS")
            .unwrap_or_else(|_| "1000".to_string());
        let callback_url = std::env::var("CALLBACK_URL")
            .unwrap_or_else(|_| "http://192.168.1.223:82/api/datastudio/trigger".to_string());
        
        let filter_pairs = std::env::var("FILTER_PAIRS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_uppercase())
            .filter(|s| !s.is_empty())
            .collect();
        
        let filter_exchanges = std::env::var("FILTER_EXCHANGES")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        
        let enabled_exchanges = std::env::var("ENABLED_EXCHANGES")
            .unwrap_or_else(|_| "binance,bybit,okx,kraken,kucoin,gate,mexc,htx,bitget,coinbase".to_string())
            .split(',')
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        
        let orderbook_depth = std::env::var("ORDERBOOK_DEPTH")
            .unwrap_or_else(|_| "5".to_string())
            .parse()
            .unwrap_or(5);
        
        Ok(Self {
            min_spread_percent: Decimal::from_str(&min_spread)
                .context("Invalid MIN_SPREAD_PERCENT")?,
            max_spread_percent: Decimal::from_str(&max_spread)
                .context("Invalid MAX_SPREAD_PERCENT")?,
            cooldown_ms: cooldown.parse().context("Invalid COOLDOWN_MS")?,
            callback_url,
            filter_pairs,
            filter_exchanges,
            enabled_exchanges,
            orderbook_depth,
        })
    }
    
    pub fn is_exchange_enabled(&self, exchange: &str) -> bool {
        self.enabled_exchanges.contains(&exchange.to_lowercase())
    }
}
