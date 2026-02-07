use dashmap::DashMap;
use std::collections::HashMap;
use tracing::info;

/// Normalized symbol format: "BTC/USDT"
pub type NormalizedSymbol = String;

/// Exchange-specific symbol format
pub type ExchangeSymbol = String;

/// Maps exchange symbols to normalized format and vice versa
pub struct TickerMatcher {
    /// Exchange -> ExchangeSymbol -> NormalizedSymbol
    to_normalized: DashMap<String, HashMap<ExchangeSymbol, NormalizedSymbol>>,
    
    /// NormalizedSymbol -> Exchange -> ExchangeSymbol  
    to_exchange: DashMap<NormalizedSymbol, HashMap<String, ExchangeSymbol>>,
    
    /// Known quote currencies (ordered by priority)
    quote_currencies: Vec<&'static str>,
}

impl TickerMatcher {
    pub fn new() -> Self {
        Self {
            to_normalized: DashMap::new(),
            to_exchange: DashMap::new(),
            quote_currencies: vec![
                "USDT", "USDC", "USD", "BUSD", "TUSD", "USDP", "DAI", "FDUSD",
                "EUR", "GBP", "JPY", "AUD", "CAD",
                "BTC", "ETH", "BNB", "SOL", "XRP",
            ],
        }
    }
    
    /// Register a symbol from an exchange and get normalized version
    pub fn register(&self, exchange: &str, exchange_symbol: &str) -> NormalizedSymbol {
        let normalized = self.normalize_symbol(exchange_symbol);
        
        // Update to_normalized map
        self.to_normalized
            .entry(exchange.to_string())
            .or_insert_with(HashMap::new)
            .insert(exchange_symbol.to_string(), normalized.clone());
        
        // Update to_exchange map
        self.to_exchange
            .entry(normalized.clone())
            .or_insert_with(HashMap::new)
            .insert(exchange.to_string(), exchange_symbol.to_string());
        
        normalized
    }
    
    /// Get normalized symbol for exchange symbol
    pub fn get_normalized(&self, exchange: &str, exchange_symbol: &str) -> Option<NormalizedSymbol> {
        self.to_normalized
            .get(exchange)
            .and_then(|map| map.get(exchange_symbol).cloned())
    }
    
    /// Get all exchanges that have this normalized symbol
    pub fn get_exchanges_for_symbol(&self, normalized: &str) -> Vec<String> {
        self.to_exchange
            .get(normalized)
            .map(|map| map.keys().cloned().collect())
            .unwrap_or_default()
    }
    
    /// Get all normalized symbols that exist on multiple exchanges
    pub fn get_arbitrageable_symbols(&self) -> Vec<NormalizedSymbol> {
        self.to_exchange
            .iter()
            .filter(|entry| entry.value().len() >= 2)
            .map(|entry| entry.key().clone())
            .collect()
    }
    
    /// Normalize symbol to standard format: "BTC/USDT"
    fn normalize_symbol(&self, raw: &str) -> NormalizedSymbol {
        let raw = raw.to_uppercase();
        
        // Already normalized (contains /)
        if raw.contains('/') {
            return raw;
        }
        
        // Handle hyphen format: BTC-USDT -> BTC/USDT
        if raw.contains('-') {
            return raw.replace('-', "/");
        }
        
        // Handle underscore format: BTC_USDT -> BTC/USDT
        if raw.contains('_') {
            return raw.replace('_', "/");
        }
        
        // Try to split by known quote currencies
        for quote in &self.quote_currencies {
            if raw.ends_with(quote) {
                let base = &raw[..raw.len() - quote.len()];
                if !base.is_empty() {
                    return format!("{}/{}", base, quote);
                }
            }
        }
        
        // Fallback: return as-is with /USD suffix guess
        format!("{}/USD", raw)
    }
    
    /// Log matcher statistics
    pub fn log_stats(&self) {
        let total_symbols = self.to_exchange.len();
        let arbitrageable = self.get_arbitrageable_symbols().len();
        let exchanges = self.to_normalized.len();
        
        info!(
            total_symbols,
            arbitrageable,
            exchanges,
            "Ticker matcher stats"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_normalize_symbol() {
        let matcher = TickerMatcher::new();
        
        assert_eq!(matcher.normalize_symbol("BTCUSDT"), "BTC/USDT");
        assert_eq!(matcher.normalize_symbol("BTC-USDT"), "BTC/USDT");
        assert_eq!(matcher.normalize_symbol("BTC_USDT"), "BTC/USDT");
        assert_eq!(matcher.normalize_symbol("BTC/USDT"), "BTC/USDT");
        assert_eq!(matcher.normalize_symbol("ETHBTC"), "ETH/BTC");
        assert_eq!(matcher.normalize_symbol("SOLUSDC"), "SOL/USDC");
    }
}
