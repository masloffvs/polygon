use crate::errors::{ATokenError, Result};
use crate::model::Block;

use scylla::{Session, SessionBuilder};

pub struct ScyllaBlockStore {
    session: Session,
    keyspace: String,
}

impl ScyllaBlockStore {
    pub async fn connect(node_uri: &str, keyspace: &str) -> Result<Self> {
        let session = SessionBuilder::new()
            .known_node(node_uri)
            .build()
            .await
            .map_err(|e| ATokenError::Storage(e.to_string()))?;
        let this = Self {
            session,
            keyspace: keyspace.to_string(),
        };
        this.ensure_schema().await?;
        Ok(this)
    }

    pub async fn ensure_schema(&self) -> Result<()> {
        let create_keyspace = format!(
            "CREATE KEYSPACE IF NOT EXISTS {} \
             WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': 1}}",
            self.keyspace
        );
        self.session
            .query_unpaged(create_keyspace, &[])
            .await
            .map_err(|e| ATokenError::Storage(e.to_string()))?;

        let create_table = format!(
            "CREATE TABLE IF NOT EXISTS {}.blocks (height bigint PRIMARY KEY, hash text, block_json text)",
            self.keyspace
        );
        self.session
            .query_unpaged(create_table, &[])
            .await
            .map_err(|e| ATokenError::Storage(e.to_string()))?;
        Ok(())
    }

    pub async fn save_block(&self, block: &Block) -> Result<()> {
        let query = format!(
            "INSERT INTO {}.blocks (height, hash, block_json) VALUES (?, ?, ?)",
            self.keyspace
        );
        let json = serde_json::to_string(block).map_err(|e| ATokenError::Storage(e.to_string()))?;
        self.session
            .query_unpaged(
                query,
                (block.header.height as i64, block.hash.clone(), json),
            )
            .await
            .map_err(|e| ATokenError::Storage(e.to_string()))?;
        Ok(())
    }

    pub async fn load_blocks(&self) -> Result<Vec<Block>> {
        let query = format!(
            "SELECT block_json FROM {}.blocks ORDER BY height ASC",
            self.keyspace
        );
        let rows_result = self
            .session
            .query_unpaged(query, &[])
            .await
            .map_err(|e| ATokenError::Storage(e.to_string()))?
            .into_rows_result()
            .map_err(|e| ATokenError::Storage(e.to_string()))?;
        let rows = rows_result
            .rows::<(String,)>()
            .map_err(|e| ATokenError::Storage(e.to_string()))?;

        let mut blocks = Vec::new();
        for row in rows {
            let (block_json,): (String,) = row.map_err(|e| ATokenError::Storage(e.to_string()))?;
            let block: Block = serde_json::from_str(&block_json)
                .map_err(|e| ATokenError::Storage(e.to_string()))?;
            blocks.push(block);
        }
        Ok(blocks)
    }
}
