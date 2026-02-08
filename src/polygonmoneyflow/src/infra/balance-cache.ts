import { Balance, ChainId } from "../../chains/common/chain-adapter";
import { getRedis } from "./redis";

export type CachedBalanceEntry = {
  chain: ChainId;
  walletId?: string;
  address: string;
  asset?: string;
  balance: Balance;
  cachedAt: string;
};

const BALANCE_KEY_PREFIX = "balance:cache:";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

const localCache = new Map<
  string,
  {
    value: CachedBalanceEntry;
    expiresAt: number;
  }
>();

const ttlSeconds = () => {
  const parsed = Number(process.env.BALANCE_CACHE_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_SECONDS;
  return Math.floor(parsed);
};

const normalizeAddress = (address: string) => address.trim().toLowerCase();

const normalizeAsset = (asset?: string) => {
  const normalized = asset?.trim().toUpperCase();
  return normalized && normalized.length ? normalized : "NATIVE";
};

const addressKey = (chain: ChainId, address: string, asset?: string) =>
  `${BALANCE_KEY_PREFIX}addr:${chain}:${normalizeAddress(address)}:${normalizeAsset(asset)}`;

const walletKey = (chain: ChainId, walletId: string, asset?: string) =>
  `${BALANCE_KEY_PREFIX}id:${chain}:${walletId}:${normalizeAsset(asset)}`;

const putLocal = (key: string, entry: CachedBalanceEntry) => {
  localCache.set(key, {
    value: entry,
    expiresAt: Date.now() + ttlSeconds() * 1000,
  });
};

const getLocal = (key: string): CachedBalanceEntry | undefined => {
  const cached = localCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    localCache.delete(key);
    return undefined;
  }
  return cached.value;
};

export const cacheBalance = async (entry: CachedBalanceEntry): Promise<void> => {
  const redis = await getRedis();
  const expiresIn = ttlSeconds();
  const addressCacheKey = addressKey(entry.chain, entry.address, entry.asset);
  const serialized = JSON.stringify(entry);

  if (!redis) {
    putLocal(addressCacheKey, entry);
    if (entry.walletId) {
      putLocal(walletKey(entry.chain, entry.walletId, entry.asset), entry);
    }
    return;
  }

  await redis.set(addressCacheKey, serialized, { EX: expiresIn });
  if (entry.walletId) {
    await redis.set(walletKey(entry.chain, entry.walletId, entry.asset), serialized, {
      EX: expiresIn,
    });
  }

  putLocal(addressCacheKey, entry);
  if (entry.walletId) {
    putLocal(walletKey(entry.chain, entry.walletId, entry.asset), entry);
  }
};

export const getCachedBalance = async (params: {
  chain: ChainId;
  walletId?: string;
  address?: string;
  asset?: string;
}): Promise<CachedBalanceEntry | undefined> => {
  const keys: string[] = [];
  if (params.walletId) keys.push(walletKey(params.chain, params.walletId, params.asset));
  if (params.address) keys.push(addressKey(params.chain, params.address, params.asset));
  if (!keys.length) return undefined;

  for (const key of keys) {
    const local = getLocal(key);
    if (local) return local;
  }

  const redis = await getRedis();
  if (!redis) return undefined;

  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as CachedBalanceEntry;
      putLocal(key, parsed);
      return parsed;
    } catch {
      continue;
    }
  }
  return undefined;
};
