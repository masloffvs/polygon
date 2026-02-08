use crate::errors::{ATokenError, Result};
use crate::model::Block;

pub trait BlockStore {
    fn save_block(&mut self, block: &Block) -> Result<()>;
    fn load_blocks(&self) -> Result<Vec<Block>>;
}

#[derive(Debug, Clone, Default)]
pub struct InMemoryBlockStore {
    blocks: Vec<Block>,
}

impl BlockStore for InMemoryBlockStore {
    fn save_block(&mut self, block: &Block) -> Result<()> {
        self.blocks.push(block.clone());
        Ok(())
    }

    fn load_blocks(&self) -> Result<Vec<Block>> {
        Ok(self.blocks.clone())
    }
}

pub fn replay_from_store<S>(chain: &mut crate::chain::ATokenChain, store: &S) -> Result<()>
where
    S: BlockStore,
{
    let blocks = store.load_blocks()?;
    for block in blocks {
        chain.append_block(block)?;
    }
    Ok(())
}

impl From<std::io::Error> for ATokenError {
    fn from(value: std::io::Error) -> Self {
        ATokenError::Storage(value.to_string())
    }
}
