use std::error::Error;

use axa_network::api::{AppState, router};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let bind_addr = std::env::var("ATOKEN_BIND").unwrap_or_else(|_| "127.0.0.1:8080".to_string());
    let chain_id =
        std::env::var("ATOKEN_CHAIN_ID").unwrap_or_else(|_| "AToken-localnet".to_string());

    let state = AppState::new(chain_id.clone());
    let app = router(state);

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    println!("AToken API listening on http://{bind_addr} (chain_id={chain_id})");

    axum::serve(listener, app).await?;
    Ok(())
}
