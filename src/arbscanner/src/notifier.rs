use anyhow::Result;
use serde::Serialize;
use std::sync::Arc;
use tracing::{error, info};

use crate::config::Config;
use crate::scanner::ArbitrageOpportunity;

/// Wrapper for callback request
#[derive(Debug, Serialize)]
pub struct CallbackRequest<T: Serialize> {
    pub key: String,
    pub payload: T,
}

/// Payload sent to callback URL
#[derive(Debug, Serialize)]
pub struct ArbitragePayload {
    pub pair: String,
    #[serde(rename = "exchangeBuy")]
    pub exchange_buy: String,
    #[serde(rename = "exchangeSell")]
    pub exchange_sell: String,
    #[serde(rename = "priceBuy")]
    pub price_buy: f64,
    #[serde(rename = "priceSell")]
    pub price_sell: f64,
    #[serde(rename = "spreadPercent")]
    pub spread_percent: f64,
    #[serde(rename = "spreadUsd")]
    pub spread_usd: f64,
    pub timestamp: i64,
}

impl From<ArbitrageOpportunity> for ArbitragePayload {
    fn from(opp: ArbitrageOpportunity) -> Self {
        use rust_decimal::prelude::ToPrimitive;
        
        Self {
            pair: opp.symbol,
            exchange_buy: capitalize(&opp.buy_exchange),
            exchange_sell: capitalize(&opp.sell_exchange),
            price_buy: opp.buy_price.to_f64().unwrap_or(0.0),
            price_sell: opp.sell_price.to_f64().unwrap_or(0.0),
            spread_percent: opp.spread_percent.to_f64().unwrap_or(0.0),
            spread_usd: opp.spread_usd.to_f64().unwrap_or(0.0),
            timestamp: opp.timestamp,
        }
    }
}

fn capitalize(s: &str) -> String {
    let mapping = [
        ("binance", "Binance"),
        ("bybit", "Bybit"),
        ("okx", "OKX"),
        ("kraken", "Kraken"),
        ("kucoin", "KuCoin"),
        ("gate", "Gate.io"),
        ("mexc", "MEXC"),
        ("htx", "HTX"),
        ("bitget", "Bitget"),
        ("coinbase", "Coinbase"),
    ];
    
    for (key, val) in mapping {
        if s.to_lowercase() == key {
            return val.to_string();
        }
    }
    
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

/// Sends notifications about arbitrage opportunities
pub struct Notifier {
    config: Arc<Config>,
    client: reqwest::Client,
}

impl Notifier {
    pub fn new(config: Arc<Config>) -> Self {
        Self {
            config,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap(),
        }
    }
    
    pub async fn notify(&self, opportunity: ArbitrageOpportunity) {
        let payload: ArbitragePayload = opportunity.into();
        
        info!(
            url = %self.config.callback_url,
            pair = %payload.pair,
            spread = %payload.spread_percent,
            "Sending notification"
        );
        
        match self.send_callback(&payload).await {
            Ok(_) => info!("Notification sent successfully"),
            Err(e) => error!(error = ?e, "Failed to send notification"),
        }
    }
    
    async fn send_callback(&self, payload: &ArbitragePayload) -> Result<()> {
        let request = CallbackRequest {
            key: "act:arbitrage-spread".to_string(),
            payload,
        };

        let response = self.client
            .post(&self.config.callback_url)
            .json(&request)
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Callback failed: {} - {}", status, body);
        }
        
        Ok(())
    }
}
