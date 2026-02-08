use thiserror::Error;

pub type Result<T> = std::result::Result<T, ATokenError>;

#[derive(Debug, Error)]
pub enum ATokenError {
    #[error("hex decode failed: {0}")]
    HexDecode(String),
    #[error("invalid private key length: expected 32 bytes, got {0}")]
    InvalidPrivateKeyLength(usize),
    #[error("invalid public key length: expected 32 bytes, got {0}")]
    InvalidPublicKeyLength(usize),
    #[error("invalid signature length: expected 64 bytes, got {0}")]
    InvalidSignatureLength(usize),
    #[error("signature verification failed")]
    InvalidSignature,
    #[error("serialization error: {0}")]
    Serialization(String),
    #[error("invalid sender")]
    InvalidSender,
    #[error("invalid block height: expected {expected}, got {actual}")]
    InvalidBlockHeight { expected: u64, actual: u64 },
    #[error("previous hash mismatch")]
    PreviousHashMismatch,
    #[error("previous three hashes mismatch")]
    PreviousThreeMismatch,
    #[error("invalid chain id: expected {expected}, got {actual}")]
    InvalidChainId { expected: String, actual: String },
    #[error("token has not been issued yet")]
    TokenNotIssued,
    #[error("token already issued, additional mint is forbidden")]
    AlreadyIssued,
    #[error("mint amount must be greater than zero")]
    MintAmountMustBePositive,
    #[error("only issuer can mint")]
    MintNotAllowed,
    #[error("transaction nonce mismatch: expected {expected}, got {actual}")]
    NonceMismatch { expected: u64, actual: u64 },
    #[error("transfer must contain at least one token id")]
    EmptyTransfer,
    #[error("duplicate token id in transfer: {0}")]
    DuplicateTokenId(u64),
    #[error("token id {0} not found")]
    UnknownToken(u64),
    #[error("sender does not own token id {token_id}")]
    NotTokenOwner { token_id: u64 },
    #[error("integrity mismatch: hash does not match block payload")]
    BlockHashMismatch,
    #[error("integrity mismatch: transaction id does not match payload")]
    TransactionIdMismatch,
    #[error("storage error: {0}")]
    Storage(String),
}
