import { ChainId, Wallet, WalletSecrets } from "../../chains/common/chain-adapter";
import { logger } from "./logger";
import { getPostgres } from "./postgres";

export type StoredWallet = Wallet & { secrets?: WalletSecrets };

const store = new Map<string, StoredWallet>();

const allowMemoryFallback = () => process.env.KEYSTORE_ALLOW_IN_MEMORY === "true";

const asMetaRecord = (meta: Wallet["meta"]): Record<string, unknown> => {
  if (meta && typeof meta === "object") return meta as Record<string, unknown>;
  return {};
};

const isInstitutionalWallet = (wallet: Wallet): boolean => {
  const meta = asMetaRecord(wallet.meta);
  return meta.institutional === true;
};

const resolvePostgres = async () => {
  const client = await getPostgres();
  if (client) return client;
  if (allowMemoryFallback()) {
    logger.warn("keystore running in memory fallback; secrets are not persisted");
    return null;
  }
  throw new Error(
    "Postgres is required for keystore persistence. Set POSTGRES_URL or POSTGRES_HOST, or set KEYSTORE_ALLOW_IN_MEMORY=true for dev."
  );
};

const parseJson = <T>(value: unknown): T | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
};

const hydrateStoredWallet = (row: {
  wallet_id: string;
  chain: string;
  address: string;
  wallet: unknown;
  secrets: unknown;
}): StoredWallet => {
  const rawWallet = parseJson<Record<string, unknown>>(row.wallet) ?? {};
  const secrets = parseJson<WalletSecrets>(row.secrets);
  const wallet = {
    ...rawWallet,
    id: (rawWallet.id as string) ?? row.wallet_id,
    chain: (rawWallet.chain as ChainId) ?? (row.chain as ChainId),
    address: (rawWallet.address as string) ?? row.address
  } as Wallet;
  return { ...wallet, secrets };
};

const hydrateWallet = (row: {
  wallet_id: string;
  chain: string;
  address: string;
  wallet: unknown;
}): Wallet => {
  const rawWallet = parseJson<Record<string, unknown>>(row.wallet) ?? {};
  return {
    ...rawWallet,
    id: (rawWallet.id as string) ?? row.wallet_id,
    chain: (rawWallet.chain as ChainId) ?? (row.chain as ChainId),
    address: (rawWallet.address as string) ?? row.address
  } as Wallet;
};

export const saveWallet = async (wallet: StoredWallet): Promise<StoredWallet> => {
  const client = await resolvePostgres();
  if (!client) {
    store.set(wallet.id, wallet);
    return wallet;
  }
  const { secrets, ...walletData } = wallet;
  const isInstitutional = isInstitutionalWallet(wallet);
  try {
    await client`
      INSERT INTO wallet_secrets (wallet_id, chain, address, wallet, secrets, is_institutional)
      VALUES (
        ${wallet.id},
        ${wallet.chain},
        ${wallet.address},
        ${client.json(walletData)},
        ${secrets ? client.json(secrets) : null},
        ${isInstitutional}
      )
      ON CONFLICT (wallet_id) DO UPDATE SET
        chain = EXCLUDED.chain,
        address = EXCLUDED.address,
        wallet = EXCLUDED.wallet,
        secrets = COALESCE(EXCLUDED.secrets, wallet_secrets.secrets),
        is_institutional = EXCLUDED.is_institutional,
        updated_at = now()
    `;
    store.set(wallet.id, wallet);
    return wallet;
  } catch (err) {
    logger.error({ err }, "postgres wallet save failed");
    if (allowMemoryFallback()) {
      store.set(wallet.id, wallet);
      return wallet;
    }
    throw err;
  }
};

export const getWallet = async (walletId: string): Promise<StoredWallet | undefined> => {
  const client = await resolvePostgres();
  if (!client) return store.get(walletId);
  try {
    const rows = await client<{
      wallet_id: string;
      chain: string;
      address: string;
      wallet: unknown;
      secrets: unknown;
    }[]>`
      SELECT wallet_id, chain, address, wallet, secrets
      FROM wallet_secrets
      WHERE wallet_id = ${walletId}
      LIMIT 1
    `;
    if (!rows.length) return undefined;
    const stored = hydrateStoredWallet(rows[0]);
    store.set(stored.id, stored);
    return stored;
  } catch (err) {
    logger.error({ err }, "postgres wallet lookup failed");
    if (allowMemoryFallback()) return store.get(walletId);
    throw err;
  }
};

export const findByAddress = async (
  chain: ChainId,
  address: string
): Promise<StoredWallet | undefined> => {
  const client = await resolvePostgres();
  if (!client) {
    for (const entry of store.values()) {
      if (entry.chain === chain && entry.address === address) return entry;
    }
    return undefined;
  }
  try {
    const rows = await client<{
      wallet_id: string;
      chain: string;
      address: string;
      wallet: unknown;
      secrets: unknown;
    }[]>`
      SELECT wallet_id, chain, address, wallet, secrets
      FROM wallet_secrets
      WHERE chain = ${chain}
        AND address = ${address}
      LIMIT 1
    `;
    if (!rows.length) return undefined;
    const stored = hydrateStoredWallet(rows[0]);
    store.set(stored.id, stored);
    return stored;
  } catch (err) {
    logger.error({ err }, "postgres wallet address lookup failed");
    if (allowMemoryFallback()) {
      for (const entry of store.values()) {
        if (entry.chain === chain && entry.address === address) return entry;
      }
      return undefined;
    }
    throw err;
  }
};

export const listInstitutionalWallets = async (filters?: {
  chain?: ChainId;
  address?: string;
  label?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: Wallet[]; total: number }> => {
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
  const offset = Math.max(filters?.offset ?? 0, 0);
  const chain = filters?.chain;
  const address = filters?.address?.toLowerCase();
  const label = filters?.label?.toLowerCase();

  const client = await resolvePostgres();
  if (!client) {
    const matches = Array.from(store.values()).filter((wallet) => isInstitutionalWallet(wallet));
    const filtered = matches.filter((wallet) => {
      if (chain && wallet.chain !== chain) return false;
      if (address && wallet.address.toLowerCase() !== address) return false;
      if (label && !wallet.label?.toLowerCase().includes(label)) return false;
      return true;
    });
    const toMillis = (value?: string) => {
      if (!value) return 0;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    filtered.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    const total = filtered.length;
    return { items: filtered.slice(offset, offset + limit), total };
  }

  const chainFilter = chain ?? null;
  const addressFilter = address ?? null;
  const labelFilter = label ? `%${label}%` : null;

  try {
    const countRows = await client<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM wallet_secrets
      WHERE is_institutional = true
        AND (${chainFilter}::text IS NULL OR chain = ${chainFilter})
        AND (${addressFilter}::text IS NULL OR LOWER(address) = ${addressFilter})
        AND (${labelFilter}::text IS NULL OR LOWER(wallet->>'label') LIKE ${labelFilter})
    `;
    const total = countRows[0]?.count ?? 0;
    const rows = await client<{
      wallet_id: string;
      chain: string;
      address: string;
      wallet: unknown;
    }[]>`
      SELECT wallet_id, chain, address, wallet
      FROM wallet_secrets
      WHERE is_institutional = true
        AND (${chainFilter}::text IS NULL OR chain = ${chainFilter})
        AND (${addressFilter}::text IS NULL OR LOWER(address) = ${addressFilter})
        AND (${labelFilter}::text IS NULL OR LOWER(wallet->>'label') LIKE ${labelFilter})
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
    const items = rows.map((row) => hydrateWallet(row));
    return { items, total };
  } catch (err) {
    logger.error({ err }, "postgres institutional wallet list failed");
    if (allowMemoryFallback()) {
      return { items: [], total: 0 };
    }
    throw err;
  }
};
