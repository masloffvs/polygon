import { ChainId, IncomingTx } from "../../chains/common/chain-adapter";
import { getRedis } from "./redis";

const TX_KEY_PREFIX = "incoming:tx:";
const INDEX_KEY_PREFIX = "incoming:index:";
const CURSOR_KEY_PREFIX = "incoming:cursor:";

const localTx = new Map<string, IncomingTx>();
const localIndex = new Map<string, string[]>();
const localCursor = new Map<string, string>();

const indexKey = (chain: ChainId, address: string) =>
  `${INDEX_KEY_PREFIX}${chain}:${address.toLowerCase()}`;

const cursorKey = (key: string) => `${CURSOR_KEY_PREFIX}${key}`;

const scoreFor = (tx: IncomingTx, fallbackNow = false) => {
  if (tx.timestamp) {
    const parsed = Date.parse(tx.timestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallbackNow ? Date.now() : 0;
};

export const recordIncomingTx = async (tx: IncomingTx): Promise<boolean> => {
  if (!tx.id) return false;
  const redis = await getRedis();
  if (!redis) {
    if (localTx.has(tx.id)) return false;
    localTx.set(tx.id, tx);
    const key = indexKey(tx.chain, tx.address);
    const list = localIndex.get(key) ?? [];
    list.unshift(tx.id);
    localIndex.set(key, list);
    return true;
  }

  const txKey = `${TX_KEY_PREFIX}${tx.id}`;
  const inserted = await redis.set(txKey, JSON.stringify(tx), { NX: true });
  if (!inserted) return false;
  await redis.zAdd(indexKey(tx.chain, tx.address), [
    { score: scoreFor(tx, true), value: tx.id }
  ]);
  return true;
};

export const listIncomingForAddress = async (
  chain: ChainId,
  address: string,
  limit = 50
): Promise<IncomingTx[]> => {
  const redis = await getRedis();
  if (!redis) {
    const key = indexKey(chain, address);
    const ids = (localIndex.get(key) ?? []).slice(0, limit);
    const items = ids
      .map((id) => localTx.get(id))
      .filter((item): item is IncomingTx => Boolean(item));
    return items.sort((a, b) => scoreFor(b) - scoreFor(a));
  }

  const ids = await redis.zRange(indexKey(chain, address), 0, limit - 1, { REV: true });
  if (!ids.length) return [];
  const values = await redis.mGet(ids.map((id) => `${TX_KEY_PREFIX}${id}`));
  const items = values
    .map((value) => {
      if (!value) return undefined;
      try {
        return JSON.parse(value) as IncomingTx;
      } catch {
        return undefined;
      }
    })
    .filter((item): item is IncomingTx => Boolean(item));
  return items.sort((a, b) => scoreFor(b) - scoreFor(a));
};

export const getCursor = async (key: string): Promise<string | undefined> => {
  const redis = await getRedis();
  if (!redis) return localCursor.get(key);
  const value = await redis.get(cursorKey(key));
  return value ?? undefined;
};

export const setCursor = async (key: string, value: string): Promise<void> => {
  const redis = await getRedis();
  if (!redis) {
    localCursor.set(key, value);
    return;
  }
  await redis.set(cursorKey(key), value);
};
