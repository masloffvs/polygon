import postgres from "postgres";
import { logger } from "./logger";

type PostgresClient = ReturnType<typeof postgres>;

let clientPromise: Promise<PostgresClient | null> | null = null;
let schemaPromise: Promise<void> | null = null;

const buildPostgresUrl = (): string | undefined => {
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  const host = process.env.POSTGRES_HOST;
  if (!host) return undefined;
  const port = process.env.POSTGRES_PORT ?? "5432";
  const user = process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB ?? "postgres";
  const userEncoded = encodeURIComponent(user);
  const auth = password
    ? `${userEncoded}:${encodeURIComponent(password)}`
    : userEncoded;
  return `postgres://${auth}@${host}:${port}/${database}`;
};

const ensureSchema = async (client: PostgresClient): Promise<void> => {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await client`
        CREATE TABLE IF NOT EXISTS wallet_secrets (
          wallet_id text PRIMARY KEY,
          chain text NOT NULL,
          address text NOT NULL,
          wallet jsonb NOT NULL,
          secrets jsonb,
          is_institutional boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await client`
        ALTER TABLE wallet_secrets
        ADD COLUMN IF NOT EXISTS is_institutional boolean NOT NULL DEFAULT false
      `;
      await client`
        CREATE INDEX IF NOT EXISTS wallet_secrets_chain_address_idx
        ON wallet_secrets (chain, address)
      `;
      await client`
        CREATE INDEX IF NOT EXISTS wallet_secrets_institutional_idx
        ON wallet_secrets (is_institutional, chain)
      `;
    })();
  }
  try {
    await schemaPromise;
  } catch (err) {
    schemaPromise = null;
    throw err;
  }
};

export const getPostgres = async (): Promise<PostgresClient | null> => {
  if (clientPromise) return clientPromise;
  const url = buildPostgresUrl();
  if (!url) return null;
  clientPromise = (async () => {
    try {
      const client = postgres(url, { max: 5 });
      await ensureSchema(client);
      return client;
    } catch (err) {
      logger.warn({ err }, "postgres unavailable");
      clientPromise = null;
      return null;
    }
  })();
  return clientPromise;
};

export const requirePostgres = async (): Promise<PostgresClient> => {
  const client = await getPostgres();
  if (!client) {
    throw new Error(
      "Postgres is required for keystore persistence. Set POSTGRES_URL or POSTGRES_HOST."
    );
  }
  return client;
};
