use std::collections::{BTreeMap, HashMap, HashSet};

use crate::crypto::{Address, Wallet, address_from_public_key, verify_signature_hex};
use crate::errors::{ATokenError, Result};
use crate::model::{Block, BlockHeader, SignedTx, TokenMetadata, TxPayload};

#[derive(Debug, Clone)]
pub struct ChainConfig {
    pub chain_id: String,
    pub issuer: Address,
    pub required_previous_blocks: usize,
}

impl ChainConfig {
    pub fn new(chain_id: impl Into<String>, issuer: Address) -> Self {
        Self {
            chain_id: chain_id.into(),
            issuer,
            required_previous_blocks: 3,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ATokenChain {
    pub config: ChainConfig,
    pub blocks: Vec<Block>,
    token_metadata: Option<TokenMetadata>,
    issued_once: bool,
    total_supply: u64,
    token_owner_by_id: BTreeMap<u64, Address>,
    last_nonce_by_address: HashMap<Address, u64>,
}

impl ATokenChain {
    pub fn new(config: ChainConfig) -> Self {
        Self {
            config,
            blocks: Vec::new(),
            token_metadata: None,
            issued_once: false,
            total_supply: 0,
            token_owner_by_id: BTreeMap::new(),
            last_nonce_by_address: HashMap::new(),
        }
    }

    pub fn next_nonce(&self, address: &Address) -> u64 {
        self.last_nonce_by_address
            .get(address)
            .copied()
            .unwrap_or(0)
            + 1
    }

    pub fn metadata(&self) -> Option<&TokenMetadata> {
        self.token_metadata.as_ref()
    }

    pub fn total_supply(&self) -> u64 {
        self.total_supply
    }

    pub fn balance_of(&self, address: &Address) -> u64 {
        self.token_owner_by_id
            .values()
            .filter(|owner| *owner == address)
            .count() as u64
    }

    pub fn owner_of(&self, token_id: u64) -> Option<&Address> {
        self.token_owner_by_id.get(&token_id)
    }

    pub fn tokens_of(&self, address: &Address) -> Vec<u64> {
        self.token_owner_by_id
            .iter()
            .filter_map(|(token_id, owner)| {
                if owner == address {
                    Some(*token_id)
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn build_block(&self, proposer: &Wallet, txs: Vec<SignedTx>) -> Result<Block> {
        let previous_hash = self.blocks.last().map(|b| b.hash.clone());
        let previous_three_hashes = self.expected_previous_three_hashes();
        let header = BlockHeader {
            chain_id: self.config.chain_id.clone(),
            height: self.blocks.len() as u64,
            previous_hash,
            previous_three_hashes,
            proposer: proposer.address(),
            proposer_public_key_hex: proposer.public_key_hex(),
            timestamp_ms: crate::crypto::now_ms(),
        };

        let sign_message = Block::previous_signature_message(&header)?;
        let previous_signature_hex = proposer.sign_hex(&sign_message);
        let hash = Block::calculate_hash(&header, &txs, &previous_signature_hex)?;

        Ok(Block {
            header,
            txs,
            previous_signature_hex,
            hash,
        })
    }

    pub fn append_block(&mut self, block: Block) -> Result<()> {
        self.validate_block_header(&block)?;
        self.validate_block_signature(&block)?;
        self.validate_block_hash(&block)?;

        for tx in &block.txs {
            self.apply_signed_tx(tx)?;
        }
        self.blocks.push(block);
        Ok(())
    }

    fn validate_block_header(&self, block: &Block) -> Result<()> {
        let expected_height = self.blocks.len() as u64;
        if block.header.height != expected_height {
            return Err(ATokenError::InvalidBlockHeight {
                expected: expected_height,
                actual: block.header.height,
            });
        }

        if block.header.chain_id != self.config.chain_id {
            return Err(ATokenError::InvalidChainId {
                expected: self.config.chain_id.clone(),
                actual: block.header.chain_id.clone(),
            });
        }

        let expected_previous_hash = self.blocks.last().map(|b| b.hash.clone());
        if block.header.previous_hash != expected_previous_hash {
            return Err(ATokenError::PreviousHashMismatch);
        }

        let expected_three = self.expected_previous_three_hashes();
        if block.header.previous_three_hashes != expected_three {
            return Err(ATokenError::PreviousThreeMismatch);
        }

        let public_key_bytes = hex::decode(&block.header.proposer_public_key_hex)
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
        let proposer_address = address_from_public_key(&verifying_key);
        if proposer_address != block.header.proposer {
            return Err(ATokenError::InvalidSender);
        }

        Ok(())
    }

    fn validate_block_signature(&self, block: &Block) -> Result<()> {
        let sign_message = Block::previous_signature_message(&block.header)?;
        verify_signature_hex(
            &block.header.proposer_public_key_hex,
            &block.previous_signature_hex,
            &sign_message,
        )?;
        Ok(())
    }

    fn validate_block_hash(&self, block: &Block) -> Result<()> {
        let expected =
            Block::calculate_hash(&block.header, &block.txs, &block.previous_signature_hex)?;
        if expected != block.hash {
            return Err(ATokenError::BlockHashMismatch);
        }
        Ok(())
    }

    fn expected_previous_three_hashes(&self) -> Vec<String> {
        let keep = self.config.required_previous_blocks;
        let start = self.blocks.len().saturating_sub(keep);
        self.blocks[start..]
            .iter()
            .map(|b| b.hash.clone())
            .collect()
    }

    fn apply_signed_tx(&mut self, tx: &SignedTx) -> Result<()> {
        tx.verify()?;

        let expected_nonce = self.next_nonce(&tx.unsigned.from);
        if tx.unsigned.nonce != expected_nonce {
            return Err(ATokenError::NonceMismatch {
                expected: expected_nonce,
                actual: tx.unsigned.nonce,
            });
        }

        match &tx.unsigned.payload {
            TxPayload::Mint { amount, metadata } => {
                self.apply_mint(tx, *amount, metadata.clone())?
            }
            TxPayload::Transfer { token_ids, to } => self.apply_transfer(tx, token_ids, to)?,
        }

        self.last_nonce_by_address
            .insert(tx.unsigned.from.clone(), tx.unsigned.nonce);
        Ok(())
    }

    fn apply_mint(
        &mut self,
        tx: &SignedTx,
        amount: u64,
        mut metadata: TokenMetadata,
    ) -> Result<()> {
        if self.issued_once {
            return Err(ATokenError::AlreadyIssued);
        }
        if tx.unsigned.from != self.config.issuer {
            return Err(ATokenError::MintNotAllowed);
        }
        if amount == 0 {
            return Err(ATokenError::MintAmountMustBePositive);
        }

        metadata.issuer = self.config.issuer.clone();
        for token_id in 0..amount {
            self.token_owner_by_id
                .insert(token_id, self.config.issuer.clone());
        }
        self.total_supply = amount;
        self.token_metadata = Some(metadata);
        self.issued_once = true;
        Ok(())
    }

    fn apply_transfer(&mut self, tx: &SignedTx, token_ids: &[u64], to: &Address) -> Result<()> {
        if !self.issued_once {
            return Err(ATokenError::TokenNotIssued);
        }
        if token_ids.is_empty() {
            return Err(ATokenError::EmptyTransfer);
        }

        let mut seen = HashSet::new();
        for token_id in token_ids {
            if !seen.insert(*token_id) {
                return Err(ATokenError::DuplicateTokenId(*token_id));
            }
            let owner = self
                .token_owner_by_id
                .get(token_id)
                .ok_or(ATokenError::UnknownToken(*token_id))?;
            if owner != &tx.unsigned.from {
                return Err(ATokenError::NotTokenOwner {
                    token_id: *token_id,
                });
            }
        }

        for token_id in token_ids {
            self.token_owner_by_id.insert(*token_id, to.clone());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{SignedTx, TokenMetadata, UnsignedTx};

    fn metadata() -> TokenMetadata {
        TokenMetadata {
            name: "AToken".to_string(),
            symbol: "ATKN".to_string(),
            description: "Test token".to_string(),
            decimals: 0,
            issuer: String::new(),
        }
    }

    #[test]
    fn mint_once_and_transfer_works() {
        let issuer = Wallet::generate();
        let alice = Wallet::generate();
        let config = ChainConfig::new("AToken-local", issuer.address());
        let mut chain = ATokenChain::new(config);

        let mint = SignedTx::sign(
            UnsignedTx::mint(
                issuer.address(),
                chain.next_nonce(&issuer.address()),
                10,
                metadata(),
            ),
            &issuer,
        )
        .unwrap();
        let b0 = chain.build_block(&issuer, vec![mint]).unwrap();
        chain.append_block(b0).unwrap();

        let token_ids = chain.tokens_of(&issuer.address());
        let transfer = SignedTx::sign(
            UnsignedTx::transfer(
                issuer.address(),
                chain.next_nonce(&issuer.address()),
                alice.address(),
                token_ids.into_iter().take(4).collect(),
            ),
            &issuer,
        )
        .unwrap();
        let b1 = chain.build_block(&issuer, vec![transfer]).unwrap();
        chain.append_block(b1).unwrap();

        assert_eq!(chain.total_supply(), 10);
        assert_eq!(chain.balance_of(&issuer.address()), 6);
        assert_eq!(chain.balance_of(&alice.address()), 4);
    }

    #[test]
    fn second_mint_is_rejected() {
        let issuer = Wallet::generate();
        let config = ChainConfig::new("AToken-local", issuer.address());
        let mut chain = ATokenChain::new(config);

        let mint1 = SignedTx::sign(
            UnsignedTx::mint(
                issuer.address(),
                chain.next_nonce(&issuer.address()),
                3,
                metadata(),
            ),
            &issuer,
        )
        .unwrap();
        let b0 = chain.build_block(&issuer, vec![mint1]).unwrap();
        chain.append_block(b0).unwrap();

        let mint2 = SignedTx::sign(
            UnsignedTx::mint(
                issuer.address(),
                chain.next_nonce(&issuer.address()),
                3,
                metadata(),
            ),
            &issuer,
        )
        .unwrap();
        let b1 = chain.build_block(&issuer, vec![mint2]).unwrap();
        let err = chain.append_block(b1).unwrap_err();
        assert!(matches!(err, ATokenError::AlreadyIssued));
    }
}
