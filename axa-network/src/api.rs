use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::chain::{ATokenChain, ChainConfig};
use crate::crypto::{Address, Wallet};
use crate::errors::ATokenError;
use crate::model::{SignedTx, TokenMetadata, UnsignedTx};
use crate::storage::{BlockStore, InMemoryBlockStore};

#[derive(Clone)]
pub struct AppState {
    inner: Arc<RwLock<AppInner>>,
}

#[derive(Debug)]
struct AppInner {
    chain_id: String,
    chain: Option<ATokenChain>,
    store: InMemoryBlockStore,
}

impl AppState {
    pub fn new(chain_id: String) -> Self {
        Self {
            inner: Arc::new(RwLock::new(AppInner {
                chain_id,
                chain: None,
                store: InMemoryBlockStore::default(),
            })),
        }
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/wallet/generate", post(wallet_generate))
        .route("/wallet/from-private-key", post(wallet_from_private_key))
        .route("/issue", post(issue))
        .route("/transfer", post(transfer))
        .route("/metadata", get(metadata))
        .route("/balance/{address}", get(balance))
        .route("/tokens/{address}", get(tokens))
        .route("/owner/{token_id}", get(owner_of))
        .route("/chain", get(chain_info))
        .with_state(state)
}

type ApiResult<T> = std::result::Result<Json<T>, ApiError>;

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl From<ATokenError> for ApiError {
    fn from(value: ATokenError) -> Self {
        let status = match value {
            ATokenError::AlreadyIssued => StatusCode::CONFLICT,
            ATokenError::MintNotAllowed => StatusCode::FORBIDDEN,
            ATokenError::TokenNotIssued => StatusCode::CONFLICT,
            ATokenError::UnknownToken(_) => StatusCode::NOT_FOUND,
            ATokenError::Storage(_) => StatusCode::INTERNAL_SERVER_ERROR,
            _ => StatusCode::BAD_REQUEST,
        };
        Self {
            status,
            message: value.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorResponse {
                error: self.message,
            }),
        )
            .into_response()
    }
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

#[derive(Debug, Serialize)]
struct WalletResponse {
    address: Address,
    private_key_hex: String,
    public_key_hex: String,
}

async fn wallet_generate() -> Json<WalletResponse> {
    let wallet = Wallet::generate();
    Json(WalletResponse {
        address: wallet.address(),
        private_key_hex: wallet.private_key_hex(),
        public_key_hex: wallet.public_key_hex(),
    })
}

#[derive(Debug, Deserialize)]
struct WalletByPrivateKeyRequest {
    private_key_hex: String,
}

async fn wallet_from_private_key(
    Json(req): Json<WalletByPrivateKeyRequest>,
) -> ApiResult<WalletResponse> {
    let wallet = Wallet::from_private_key_hex(&req.private_key_hex)?;
    Ok(Json(WalletResponse {
        address: wallet.address(),
        private_key_hex: wallet.private_key_hex(),
        public_key_hex: wallet.public_key_hex(),
    }))
}

#[derive(Debug, Deserialize)]
struct MetadataInput {
    name: String,
    symbol: String,
    description: String,
    decimals: u8,
}

#[derive(Debug, Deserialize)]
struct IssueRequest {
    issuer_private_key_hex: String,
    amount: u64,
    metadata: MetadataInput,
}

#[derive(Debug, Serialize)]
struct TxAcceptedResponse {
    block_height: u64,
    block_hash: String,
    tx_id: String,
}

async fn issue(
    State(state): State<AppState>,
    Json(req): Json<IssueRequest>,
) -> ApiResult<TxAcceptedResponse> {
    let issuer_wallet = Wallet::from_private_key_hex(&req.issuer_private_key_hex)?;
    let issuer_address = issuer_wallet.address();

    let mut guard = state.inner.write().await;
    if guard.chain.is_none() {
        guard.chain = Some(ATokenChain::new(ChainConfig::new(
            guard.chain_id.clone(),
            issuer_address.clone(),
        )));
    }

    let chain = guard
        .chain
        .as_mut()
        .ok_or(ATokenError::Storage("chain is not initialized".to_string()))?;
    if chain.config.issuer != issuer_address {
        return Err(ATokenError::MintNotAllowed.into());
    }

    let mint_tx = SignedTx::sign(
        UnsignedTx::mint(
            issuer_address.clone(),
            chain.next_nonce(&issuer_address),
            req.amount,
            TokenMetadata {
                name: req.metadata.name,
                symbol: req.metadata.symbol,
                description: req.metadata.description,
                decimals: req.metadata.decimals,
                issuer: String::new(),
            },
        ),
        &issuer_wallet,
    )?;
    let tx_id = mint_tx.id.clone();
    let block = chain.build_block(&issuer_wallet, vec![mint_tx])?;
    chain.append_block(block.clone())?;
    guard.store.save_block(&block)?;

    Ok(Json(TxAcceptedResponse {
        block_height: block.header.height,
        block_hash: block.hash,
        tx_id,
    }))
}

#[derive(Debug, Deserialize)]
struct TransferRequest {
    from_private_key_hex: String,
    to_address: Address,
    token_ids: Vec<u64>,
}

async fn transfer(
    State(state): State<AppState>,
    Json(req): Json<TransferRequest>,
) -> ApiResult<TxAcceptedResponse> {
    let from_wallet = Wallet::from_private_key_hex(&req.from_private_key_hex)?;
    let from_address = from_wallet.address();

    let mut guard = state.inner.write().await;
    let chain = guard.chain.as_mut().ok_or(ATokenError::TokenNotIssued)?;

    let tx = SignedTx::sign(
        UnsignedTx::transfer(
            from_address.clone(),
            chain.next_nonce(&from_address),
            req.to_address,
            req.token_ids,
        ),
        &from_wallet,
    )?;
    let tx_id = tx.id.clone();
    let block = chain.build_block(&from_wallet, vec![tx])?;
    chain.append_block(block.clone())?;
    guard.store.save_block(&block)?;

    Ok(Json(TxAcceptedResponse {
        block_height: block.header.height,
        block_hash: block.hash,
        tx_id,
    }))
}

#[derive(Debug, Serialize)]
struct MetadataResponse {
    metadata: Option<TokenMetadata>,
}

async fn metadata(State(state): State<AppState>) -> Json<MetadataResponse> {
    let guard = state.inner.read().await;
    let metadata = guard
        .chain
        .as_ref()
        .and_then(|chain| chain.metadata().cloned());
    Json(MetadataResponse { metadata })
}

#[derive(Debug, Serialize)]
struct BalanceResponse {
    address: Address,
    balance: u64,
}

async fn balance(
    State(state): State<AppState>,
    Path(address): Path<Address>,
) -> Json<BalanceResponse> {
    let guard = state.inner.read().await;
    let balance = guard
        .chain
        .as_ref()
        .map(|chain| chain.balance_of(&address))
        .unwrap_or(0);

    Json(BalanceResponse { address, balance })
}

#[derive(Debug, Serialize)]
struct TokensResponse {
    address: Address,
    token_ids: Vec<u64>,
}

async fn tokens(
    State(state): State<AppState>,
    Path(address): Path<Address>,
) -> Json<TokensResponse> {
    let guard = state.inner.read().await;
    let token_ids = guard
        .chain
        .as_ref()
        .map(|chain| chain.tokens_of(&address))
        .unwrap_or_default();

    Json(TokensResponse { address, token_ids })
}

#[derive(Debug, Serialize)]
struct OwnerResponse {
    token_id: u64,
    owner: Address,
}

async fn owner_of(
    State(state): State<AppState>,
    Path(token_id): Path<u64>,
) -> ApiResult<OwnerResponse> {
    let guard = state.inner.read().await;
    let chain = guard.chain.as_ref().ok_or(ATokenError::TokenNotIssued)?;
    let owner = chain
        .owner_of(token_id)
        .cloned()
        .ok_or(ATokenError::UnknownToken(token_id))?;

    Ok(Json(OwnerResponse { token_id, owner }))
}

#[derive(Debug, Serialize)]
struct ChainInfoResponse {
    chain_id: String,
    initialized: bool,
    issued: bool,
    total_supply: u64,
    blocks: usize,
}

async fn chain_info(State(state): State<AppState>) -> Json<ChainInfoResponse> {
    let guard = state.inner.read().await;
    match guard.chain.as_ref() {
        Some(chain) => Json(ChainInfoResponse {
            chain_id: chain.config.chain_id.clone(),
            initialized: true,
            issued: chain.metadata().is_some(),
            total_supply: chain.total_supply(),
            blocks: chain.blocks.len(),
        }),
        None => Json(ChainInfoResponse {
            chain_id: guard.chain_id.clone(),
            initialized: false,
            issued: false,
            total_supply: 0,
            blocks: 0,
        }),
    }
}
