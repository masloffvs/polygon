import { ChainId, Wallet } from "../../chains/common/chain-adapter";
import { getRedis } from "./redis";

const WALLET_HASH_KEY = "wallets:byId";
const OWNER_SET_PREFIX = "wallets:byOwner:";
const localRegistry = new Map<string, Wallet>();

const normalizeOwner = (owner: string) => owner.trim().toLowerCase();

const normalizeWallet = (wallet: Wallet): Wallet => ({
  id: wallet.id,
  address: wallet.address,
  chain: wallet.chain,
  label: wallet.label,
  createdAt: wallet.createdAt ?? new Date().toISOString(),
  walletVirtualOwner: wallet.walletVirtualOwner,
  meta: wallet.meta,
});

export const registerWallet = async (wallet: Wallet) => {
  const normalized = normalizeWallet(wallet);
  localRegistry.set(normalized.id, normalized);
  const redis = await getRedis();
  if (!redis) return;
  await redis.hSet(WALLET_HASH_KEY, normalized.id, JSON.stringify(normalized));
  if (normalized.walletVirtualOwner) {
    const ownerKey = `${OWNER_SET_PREFIX}${normalizeOwner(normalized.walletVirtualOwner)}`;
    await redis.sAdd(ownerKey, normalized.id);
  }
};

export const listWallets = async (): Promise<Wallet[]> => {
  const redis = await getRedis();
  if (!redis) return Array.from(localRegistry.values());
  const data = await redis.hGetAll(WALLET_HASH_KEY);
  return Object.values(data)
    .map((value) => {
      try {
        return JSON.parse(value) as Wallet;
      } catch {
        return undefined;
      }
    })
    .filter((wallet): wallet is Wallet => Boolean(wallet));
};

export const listWalletsByOwner = async (owner: string): Promise<Wallet[]> => {
  const normalizedOwner = normalizeOwner(owner);
  const redis = await getRedis();
  if (!redis) {
    return Array.from(localRegistry.values()).filter(
      (wallet) => wallet.walletVirtualOwner?.toLowerCase() === normalizedOwner,
    );
  }
  const ids = await redis.sMembers(`${OWNER_SET_PREFIX}${normalizedOwner}`);
  if (!ids.length) return [];
  const values = await redis.hmGet(WALLET_HASH_KEY, ids);
  return values
    .map((value) => {
      if (!value) return undefined;
      try {
        return JSON.parse(value) as Wallet;
      } catch {
        return undefined;
      }
    })
    .filter((wallet): wallet is Wallet => Boolean(wallet));
};

export const getWallet = async (
  walletId: string,
): Promise<Wallet | undefined> => {
  const cached = localRegistry.get(walletId);
  if (cached) return cached;
  const redis = await getRedis();
  if (!redis) return undefined;
  const value = await redis.hGet(WALLET_HASH_KEY, walletId);
  if (!value) return undefined;
  try {
    const wallet = JSON.parse(value) as Wallet;
    localRegistry.set(wallet.id, wallet);
    return wallet;
  } catch {
    return undefined;
  }
};

export const findWalletByAddress = async (
  chain: ChainId,
  address: string,
): Promise<Wallet | undefined> => {
  const wallets = await listWallets();
  const target = address.toLowerCase();
  return wallets.find(
    (wallet) =>
      wallet.chain === chain && wallet.address.toLowerCase() === target,
  );
};
