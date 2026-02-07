mod config;
mod exchanges;
mod matcher;
mod scanner;
mod notifier;

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{info, error, Level};
use tracing_subscriber::EnvFilter;

use config::Config;
use exchanges::ExchangeManager;
use matcher::TickerMatcher;
use scanner::ArbitrageScanner;
use notifier::Notifier;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive(Level::INFO.into())
        )
        .json()
        .init();

    info!("ArbScanner starting...");

    // Load config from env
    let config = Arc::new(Config::from_env()?);
    
    info!(
        min_spread = %config.min_spread_percent,
        max_spread = %config.max_spread_percent,
        cooldown_ms = config.cooldown_ms,
        callback_url = %config.callback_url,
        "Configuration loaded"
    );

    // Create shared state
    let matcher = Arc::new(TickerMatcher::new());
    let notifier = Arc::new(Notifier::new(config.clone()));
    
    // Broadcast channel for price updates
    let (price_tx, _) = broadcast::channel(10000);
    
    // Start exchange connections
    let exchange_manager = ExchangeManager::new(
        config.clone(),
        matcher.clone(),
        price_tx.clone(),
    );
    
    // Start scanner
    let scanner = ArbitrageScanner::new(
        config.clone(),
        matcher.clone(),
        notifier.clone(),
        price_tx.subscribe(),
    );
    
    // Run everything
    tokio::select! {
        res = exchange_manager.run() => {
            error!(?res, "Exchange manager stopped");
        }
        res = scanner.run() => {
            error!(?res, "Scanner stopped");
        }
    }

    Ok(())
}
