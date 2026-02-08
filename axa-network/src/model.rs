use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::crypto::{
    Address, Wallet, address_from_public_key, now_ms, sha256_hex, verify_signature_hex,
};
use crate::errors::{ATokenError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenMetadata {
    pub name: String,
    pub symbol: String,
    pub description: String,
    pub decimals: u8,
    pub issuer: Address,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TxPayload {
    Mint {
        amount: u64,
        metadata: TokenMetadata,
    },
    Transfer {
        token_ids: Vec<u64>,
        to: Address,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsignedTx {
    pub from: Address,
    pub nonce: u64,
    pub timestamp_ms: u64,
    pub payload: TxPayload,
}

impl UnsignedTx {
    pub fn mint(from: Address, nonce: u64, amount: u64, metadata: TokenMetadata) -> Self {
        Self {
            from,
            nonce,
            timestamp_ms: now_ms(),
            payload: TxPayload::Mint { amount, metadata },
        }
    }

    pub fn transfer(from: Address, nonce: u64, to: Address, token_ids: Vec<u64>) -> Self {
        Self {
            from,
            nonce,
            timestamp_ms: now_ms(),
            payload: TxPayload::Transfer { token_ids, to },
        }
    }

    pub fn signing_bytes(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|e| ATokenError::Serialization(e.to_string()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedTx {
    pub id: String,
    pub unsigned: UnsignedTx,
    pub public_key_hex: String,
    pub signature_hex: String,
}

impl SignedTx {
    pub fn sign(unsigned: UnsignedTx, wallet: &Wallet) -> Result<Self> {
        if unsigned.from != wallet.address() {
            return Err(ATokenError::InvalidSender);
        }
        let message = unsigned.signing_bytes()?;
        let signature_hex = wallet.sign_hex(&message);
        let public_key_hex = wallet.public_key_hex();
        let id = Self::compute_id(&unsigned, &public_key_hex, &signature_hex)?;
        Ok(Self {
            id,
            unsigned,
            public_key_hex,
            signature_hex,
        })
    }

    pub fn verify(&self) -> Result<()> {
        let message = self.unsigned.signing_bytes()?;
        verify_signature_hex(&self.public_key_hex, &self.signature_hex, &message)?;

        let public_key_bytes = hex::decode(&self.public_key_hex)
            .map_err(|e| ATokenError::HexDecode(format!("public key: {e}")))?;
        let public_key_len = public_key_bytes.len();
        if public_key_len != 32 {
            return Err(ATokenError::InvalidPublicKeyLength(public_key_len));
        }
        let public_key_arr: [u8; 32] = public_key_bytes
            .as_slice()
            .try_into()
            .map_err(|_| ATokenError::InvalidPublicKeyLength(public_key_len))?;
        let verifying_key = ed25519_dalek::VerifyingKey::from_bytes(&public_key_arr)
            .map_err(|_| ATokenError::InvalidPublicKeyLength(public_key_len))?;
        let resolved_address = address_from_public_key(&verifying_key);
        if resolved_address != self.unsigned.from {
            return Err(ATokenError::InvalidSender);
        }

        let expected_id =
            Self::compute_id(&self.unsigned, &self.public_key_hex, &self.signature_hex)?;
        if expected_id != self.id {
            return Err(ATokenError::TransactionIdMismatch);
        }

        Ok(())
    }

    fn compute_id(
        unsigned: &UnsignedTx,
        public_key_hex: &str,
        signature_hex: &str,
    ) -> Result<String> {
        let bytes = serde_json::to_vec(&(unsigned, public_key_hex, signature_hex))
            .map_err(|e| ATokenError::Serialization(e.to_string()))?;
        Ok(sha256_hex(&bytes))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockHeader {
    pub chain_id: String,
    pub height: u64,
    pub previous_hash: Option<String>,
    pub previous_three_hashes: Vec<String>,
    pub proposer: Address,
    pub proposer_public_key_hex: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub header: BlockHeader,
    pub txs: Vec<SignedTx>,
    pub previous_signature_hex: String,
    pub hash: String,
}

impl Block {
    pub fn previous_signature_message(header: &BlockHeader) -> Result<Vec<u8>> {
        serde_json::to_vec(&(
            header.chain_id.as_str(),
            header.height,
            header.previous_three_hashes.as_slice(),
        ))
        .map_err(|e| ATokenError::Serialization(e.to_string()))
    }

    pub fn calculate_hash(
        header: &BlockHeader,
        txs: &[SignedTx],
        previous_signature_hex: &str,
    ) -> Result<String> {
        let payload = serde_json::to_vec(&(header, txs, previous_signature_hex))
            .map_err(|e| ATokenError::Serialization(e.to_string()))?;
        let mut hasher = Sha256::new();
        hasher.update(payload);
        Ok(hex::encode(hasher.finalize()))
    }
}
