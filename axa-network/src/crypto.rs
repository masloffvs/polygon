use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand_core::OsRng;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::errors::{ATokenError, Result};

pub type Address = String;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    hex::encode(digest)
}

pub fn address_from_public_key(verifying_key: &VerifyingKey) -> Address {
    let digest = Sha256::digest(verifying_key.to_bytes());
    hex::encode(&digest[..20])
}

#[derive(Clone)]
pub struct Wallet {
    signing_key: SigningKey,
}

impl Wallet {
    pub fn generate() -> Self {
        let mut rng = OsRng;
        let signing_key = SigningKey::generate(&mut rng);
        Self { signing_key }
    }

    pub fn from_private_key_hex(private_key_hex: &str) -> Result<Self> {
        let bytes = hex::decode(private_key_hex)
            .map_err(|e| ATokenError::HexDecode(format!("private key: {e}")))?;
        let key_len = bytes.len();
        if key_len != 32 {
            return Err(ATokenError::InvalidPrivateKeyLength(key_len));
        }
        let arr: [u8; 32] = bytes
            .as_slice()
            .try_into()
            .map_err(|_| ATokenError::InvalidPrivateKeyLength(key_len))?;
        Ok(Self {
            signing_key: SigningKey::from_bytes(&arr),
        })
    }

    pub fn private_key_hex(&self) -> String {
        hex::encode(self.signing_key.to_bytes())
    }

    pub fn public_key_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().to_bytes())
    }

    pub fn address(&self) -> Address {
        address_from_public_key(&self.signing_key.verifying_key())
    }

    pub fn sign_hex(&self, message: &[u8]) -> String {
        let signature: Signature = self.signing_key.sign(message);
        hex::encode(signature.to_bytes())
    }
}

pub fn verify_signature_hex(
    public_key_hex: &str,
    signature_hex: &str,
    message: &[u8],
) -> Result<()> {
    let public_key_bytes = hex::decode(public_key_hex)
        .map_err(|e| ATokenError::HexDecode(format!("public key: {e}")))?;
    let public_key_len = public_key_bytes.len();
    if public_key_len != 32 {
        return Err(ATokenError::InvalidPublicKeyLength(public_key_len));
    }
    let public_key_arr: [u8; 32] = public_key_bytes
        .as_slice()
        .try_into()
        .map_err(|_| ATokenError::InvalidPublicKeyLength(public_key_len))?;

    let signature_bytes = hex::decode(signature_hex)
        .map_err(|e| ATokenError::HexDecode(format!("signature: {e}")))?;
    let signature_len = signature_bytes.len();
    if signature_len != 64 {
        return Err(ATokenError::InvalidSignatureLength(signature_len));
    }
    let signature_arr: [u8; 64] = signature_bytes
        .as_slice()
        .try_into()
        .map_err(|_| ATokenError::InvalidSignatureLength(signature_len))?;

    let verifying_key = VerifyingKey::from_bytes(&public_key_arr)
        .map_err(|_| ATokenError::InvalidPublicKeyLength(public_key_len))?;
    let signature = Signature::from_bytes(&signature_arr);

    verifying_key
        .verify(message, &signature)
        .map_err(|_| ATokenError::InvalidSignature)
}
