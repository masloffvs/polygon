import { ed25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";
import { bytesToHex } from "@noble/hashes/utils";
import { bech32 } from "@scure/base";
import { ChainAdapter, IncomingTx, TxDraft, TxStatus } from "../common/chain-adapter";
import { withRpcFallback } from "../common/rpc";
import { ChainRpcConfig } from "../config";

export type AdaConfig = {
  rpc: ChainRpcConfig;
};

const DECIMALS = 6;
const LOVELACE_PER_ADA = 1_000_000n;

const toUrl = (base: string, path: string): string =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const formatLovelace = (value: bigint): string => {
  const whole = value / LOVELACE_PER_ADA;
  const frac = value % LOVELACE_PER_ADA;
  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString();
};

const parseLovelace = (value: string): bigint => {
  const [whole, fraction = ""] = value.trim().split(".");
  const fractionPadded = (fraction + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(whole || "0") * LOVELACE_PER_ADA + BigInt(fractionPadded || "0");
};

const asBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim()) return BigInt(value);
  return 0n;
};

const normalizeRawTx = (draft: TxDraft): string | undefined => {
  const rawTx = draft.rawTx?.trim();
  if (!rawTx) return undefined;
  if (/^[0-9a-fA-F]+$/.test(rawTx)) return rawTx;
  return undefined;
};

const createEnterpriseAddress = (privateKey: Uint8Array): string => {
  const publicKey = ed25519.getPublicKey(privateKey);
  const keyHash = blake2b(publicKey, { dkLen: 28 });
  const payload = new Uint8Array(1 + keyHash.length);
  payload[0] = 0x61; // enterprise addr + mainnet network id
  payload.set(keyHash, 1);
  return bech32.encode("addr", bech32.toWords(payload), 1000);
};

const extractAddressBalance = (value: unknown): bigint => {
  if (!Array.isArray(value) || !value.length) return 0n;
  const entry = value[0] as Record<string, unknown>;
  return (
    asBigInt(entry.balance) ||
    asBigInt(entry.address_balance) ||
    asBigInt(entry.total_balance) ||
    0n
  );
};

const extractTxStatus = (value: unknown): TxStatus["status"] => {
  if (!Array.isArray(value) || !value.length) return "unknown";
  const entry = value[0] as Record<string, unknown>;
  const raw =
    (typeof entry.tx_status === "string" && entry.tx_status) ||
    (typeof entry.status === "string" && entry.status) ||
    "";
  const normalized = raw.toLowerCase();
  if (!normalized) return "unknown";
  if (["in_ledger", "confirmed", "success", "applied"].includes(normalized)) return "confirmed";
  if (["pending", "mempool", "in_mempool"].includes(normalized)) return "pending";
  if (["failed", "error", "rejected"].includes(normalized)) return "failed";
  return "unknown";
};

type KoiosAddressTx = {
  tx_hash?: string;
  block_height?: number;
  block_time?: number;
};

type KoiosTxInfo = {
  tx_hash?: string;
  block_height?: number;
  block_time?: number;
  inputs?: Array<{
    payment_addr?: {
      bech32?: string;
    };
  }>;
  outputs?: Array<{
    payment_addr?: {
      bech32?: string;
    };
    value?: number | string;
  }>;
};

const fetchAddressTxHashes = async (
  endpoint: string,
  address: string,
  limit: number
): Promise<string[]> => {
  const safeLimit = Math.max(1, limit);
  const postRes = await fetch(toUrl(endpoint, "/address_txs"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      _addresses: [address]
    })
  });
  if (!postRes.ok) {
    throw new Error(`ADA incoming tx lookup failed (${postRes.status}): ${await postRes.text()}`);
  }
  const rows = (await postRes.json()) as KoiosAddressTx[];
  return rows
    .filter((row): row is KoiosAddressTx & { tx_hash: string } => typeof row.tx_hash === "string")
    .sort((a, b) => {
      const blockCmp = (b.block_height ?? 0) - (a.block_height ?? 0);
      if (blockCmp !== 0) return blockCmp;
      return (b.block_time ?? 0) - (a.block_time ?? 0);
    })
    .slice(0, safeLimit)
    .map((row) => row.tx_hash);
};

const fetchTxInfo = async (endpoint: string, txHashes: string[]): Promise<KoiosTxInfo[]> => {
  if (!txHashes.length) return [];
  const res = await fetch(toUrl(endpoint, "/tx_info"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      _tx_hashes: txHashes
    })
  });
  if (!res.ok) {
    throw new Error(`ADA tx_info lookup failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as KoiosTxInfo[];
};

export const listIncomingTransactions = async (
  config: AdaConfig,
  address: string,
  limit = 20
): Promise<IncomingTx[]> => {
  return withRpcFallback(config.rpc, async (endpoint) => {
    const txHashes = await fetchAddressTxHashes(endpoint, address, limit);
    if (!txHashes.length) return [];
    const infos = await fetchTxInfo(endpoint, txHashes);
    const items: IncomingTx[] = [];

    for (const info of infos) {
      const txHash = info.tx_hash;
      if (!txHash) continue;
      const outputs = info.outputs ?? [];
      let incoming = 0n;
      for (const output of outputs) {
        const to = output.payment_addr?.bech32;
        if (to !== address) continue;
        incoming += asBigInt(output.value);
      }
      if (incoming <= 0n) continue;

      const from =
        (info.inputs ?? [])
          .map((input) => input.payment_addr?.bech32)
          .find((value): value is string => Boolean(value && value !== address)) ??
        (info.inputs ?? [])
          .map((input) => input.payment_addr?.bech32)
          .find((value): value is string => Boolean(value));

      items.push({
        id: `ada:${txHash}:${address}`,
        chain: "ada",
        address,
        amount: formatLovelace(incoming),
        asset: "ADA",
        status: "confirmed",
        txHash,
        from,
        blockNumber: info.block_height,
        timestamp:
          typeof info.block_time === "number"
            ? new Date(info.block_time * 1000).toISOString()
            : undefined
      });
      if (items.length >= limit) break;
    }

    return items.slice(0, limit);
  });
};

export const createAdaAdapter = (_config: AdaConfig): ChainAdapter => {
  const rpc = _config.rpc;

  return {
    chain: "ada",
    async createWallet(label) {
      const privateKey = crypto.getRandomValues(new Uint8Array(32));
      const address = createEnterpriseAddress(privateKey);
      const publicKey = ed25519.getPublicKey(privateKey);
      return {
        wallet: {
          id: crypto.randomUUID(),
          address,
          chain: "ada",
          label,
          meta: { publicKey: bytesToHex(publicKey), addressType: "enterprise" }
        },
        secrets: { privateKey: bytesToHex(privateKey) }
      };
    },
    async getBalance(wallet) {
      return withRpcFallback(rpc, async (endpoint) => {
        const res = await fetch(toUrl(endpoint, "/address_info"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ _addresses: [wallet.address] })
        });
        if (!res.ok) {
          throw new Error(`ADA balance lookup failed (${res.status}): ${await res.text()}`);
        }
        const data = await res.json();
        const lovelace = extractAddressBalance(data);
        return {
          amount: formatLovelace(lovelace),
          decimals: DECIMALS,
          symbol: "ADA"
        };
      });
    },
    async estimateFee(draft) {
      const amount = parseLovelace(draft.amount);
      if (amount <= 0n) throw new Error("amount must be > 0 for ADA transfer");
      return {
        amount: "0.17",
        currency: "ADA",
        priority: "medium"
      };
    },
    async sendTransaction(draft) {
      const rawTx = normalizeRawTx(draft);
      if (!rawTx) {
        throw new Error("ADA send requires rawTx (signed transaction CBOR hex) in request body.");
      }
      return withRpcFallback(rpc, async (endpoint) => {
        const res = await fetch(toUrl(endpoint, "/submittx"), {
          method: "POST",
          body: rawTx,
          headers: { "content-type": "text/plain" }
        });
        if (!res.ok) {
          throw new Error(`ADA broadcast failed (${res.status}): ${await res.text()}`);
        }
        const txHash = (await res.text()).trim();
        if (!txHash) throw new Error("ADA broadcast did not return tx hash");
        return {
          txnId: draft.clientTxnId ?? txHash,
          txHash,
          status: "pending"
        };
      });
    },
    async getStatus(txnId): Promise<TxStatus> {
      return withRpcFallback(rpc, async (endpoint) => {
        const statusRes = await fetch(
          toUrl(endpoint, `/tx_status?_tx_hash=${encodeURIComponent(txnId)}`)
        );
        if (statusRes.status === 404) return { txnId, txHash: txnId, status: "pending" };
        if (!statusRes.ok) {
          throw new Error(`ADA status lookup failed (${statusRes.status}): ${await statusRes.text()}`);
        }
        const statusPayload = await statusRes.json();
        const status = extractTxStatus(statusPayload);
        return { txnId, txHash: txnId, status };
      });
    }
  };
};
