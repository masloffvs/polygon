import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import {
  ChainAdapter,
  IncomingTx,
  TxDraft,
  TxStatus,
  WalletSecrets
} from "../common/chain-adapter";
import { withRpcFallback } from "../common/rpc";
import { ChainRpcConfig } from "../config";

export type BitcoinConfig = {
  rpc: ChainRpcConfig;
};

bitcoin.initEccLib(tinysecp);
const ECPair = ECPairFactory(tinysecp);
const BTC_NETWORK = bitcoin.networks.bitcoin;

const DECIMALS = 8;
const SATS_PER_BTC = 100_000_000n;
const DUST_SATS = 546n;

const jsonHeaders = { "content-type": "application/json" } as const;

type MempoolUtxo = {
  txid: string;
  vout: number;
  value: number;
};

const toUrl = (base: string, path: string): string =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const toHex = (value: Uint8Array): string => Buffer.from(value).toString("hex");

const formatSats = (value: bigint): string => {
  const safe = value < 0n ? 0n : value;
  const whole = safe / SATS_PER_BTC;
  const frac = safe % SATS_PER_BTC;
  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString();
};

const parseSats = (value: string): bigint => {
  const [whole, fraction = ""] = value.trim().split(".");
  const fractionPadded = (fraction + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(whole || "0") * SATS_PER_BTC + BigInt(fractionPadded || "0");
};

const asNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const asBigInt = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim()) return BigInt(value);
  return 0n;
};

const estimateVirtualBytes = (inputs: number, outputs: number): number =>
  10 + inputs * 68 + outputs * 31;

const estimateFeeSats = (inputs: number, outputs: number, satPerVb: number): bigint => {
  const vbytes = estimateVirtualBytes(inputs, outputs);
  return BigInt(Math.ceil(vbytes * Math.max(1, satPerVb)));
};

const normalizeRawTx = (draft: TxDraft): string | undefined => {
  const candidate = draft.rawTx?.trim() ?? "";
  if (candidate && /^[0-9a-fA-F]+$/.test(candidate)) return candidate;
  return undefined;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { headers: jsonHeaders });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  return (await res.json()) as T;
};

type MempoolTx = {
  txid: string;
  vin?: Array<{
    prevout?: {
      scriptpubkey_address?: string;
    };
  }>;
  vout?: Array<{
    scriptpubkey_address?: string;
    value?: number;
  }>;
  status?: {
    confirmed?: boolean;
    block_height?: number;
    block_time?: number;
  };
};

const ensurePrivateKey = (secrets?: WalletSecrets): Uint8Array => {
  const privateKeyHex = secrets?.privateKey?.trim();
  if (!privateKeyHex) {
    throw new Error("privateKey is required for native BTC signing");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(privateKeyHex)) {
    throw new Error("privateKey must be a 32-byte hex string for BTC signing");
  }
  return Buffer.from(privateKeyHex, "hex");
};

const selectUtxos = (utxos: MempoolUtxo[], amountSats: bigint, satPerVb: number) => {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected: MempoolUtxo[] = [];
  let total = 0n;

  for (const utxo of sorted) {
    selected.push(utxo);
    total += BigInt(utxo.value);
    const inputs = selected.length;
    const feeWithChange = estimateFeeSats(inputs, 2, satPerVb);
    const feeNoChange = estimateFeeSats(inputs, 1, satPerVb);
    if (total >= amountSats + feeWithChange + DUST_SATS || total >= amountSats + feeNoChange) {
      break;
    }
  }

  if (!selected.length) throw new Error("No spendable BTC UTXOs found for this address");

  const inputs = selected.length;
  const feeNoChange = estimateFeeSats(inputs, 1, satPerVb);
  if (total < amountSats + feeNoChange) {
    throw new Error("Insufficient BTC balance for amount + network fee");
  }

  const feeWithChange = estimateFeeSats(inputs, 2, satPerVb);
  const changeWithChangeOutput = total - amountSats - feeWithChange;
  if (changeWithChangeOutput >= DUST_SATS) {
    return {
      selected,
      feeSats: feeWithChange,
      changeSats: changeWithChangeOutput
    };
  }

  return {
    selected,
    feeSats: feeNoChange,
    changeSats: 0n
  };
};

const buildAndSignTx = async (
  endpoint: string,
  draft: TxDraft
): Promise<{ rawTx: string; txHash: string; feeSats: bigint }> => {
  const amountSats = parseSats(draft.amount);
  if (amountSats <= 0n) throw new Error("amount must be > 0 for BTC transfer");

  const privateKey = ensurePrivateKey(draft.secrets);
  const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey), { network: BTC_NETWORK });
  if (!keyPair.publicKey) throw new Error("Failed to derive Bitcoin public key");

  const payment = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: BTC_NETWORK
  });
  if (!payment.address || !payment.output) {
    throw new Error("Failed to derive Bitcoin source address");
  }

  const sourceAddress = draft.from.address.startsWith("rawtx:") ? payment.address : draft.from.address;
  if (sourceAddress !== payment.address) {
    throw new Error("Provided wallet address does not match privateKey");
  }

  const utxos = await fetchJson<MempoolUtxo[]>(toUrl(endpoint, `/address/${sourceAddress}/utxo`));
  if (!utxos.length) throw new Error("No UTXOs available for BTC wallet");

  const fees = await fetchJson<{
    fastestFee?: number;
    halfHourFee?: number;
    hourFee?: number;
  }>(toUrl(endpoint, "/v1/fees/recommended"));
  const satPerVb = Math.max(
    1,
    asNumber(fees.halfHourFee) || asNumber(fees.hourFee) || asNumber(fees.fastestFee) || 10
  );

  const selection = selectUtxos(utxos, amountSats, satPerVb);
  const psbt = new bitcoin.Psbt({ network: BTC_NETWORK });

  for (const utxo of selection.selected) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: payment.output,
        value: BigInt(utxo.value)
      }
    });
  }

  psbt.addOutput({
    address: draft.to,
    value: amountSats
  });

  if (selection.changeSats >= DUST_SATS) {
    psbt.addOutput({
      address: sourceAddress,
      value: selection.changeSats
    });
  }

  for (let i = 0; i < selection.selected.length; i += 1) {
    psbt.signInput(i, keyPair);
  }

  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return {
    rawTx: tx.toHex(),
    txHash: tx.getId(),
    feeSats: selection.feeSats
  };
};

export const listIncomingTransactions = async (
  config: BitcoinConfig,
  address: string,
  limit = 20
): Promise<IncomingTx[]> => {
  return withRpcFallback(config.rpc, async (endpoint) => {
    const txs = await fetchJson<MempoolTx[]>(
      toUrl(endpoint, `/address/${address}/txs`)
    );
    const items: IncomingTx[] = [];

    for (const tx of txs.slice(0, limit)) {
      const status = tx.status?.confirmed ? "confirmed" : "pending";
      const from = tx.vin?.[0]?.prevout?.scriptpubkey_address;
      for (let i = 0; i < (tx.vout?.length ?? 0); i += 1) {
        const output = tx.vout?.[i];
        if (!output) continue;
        if (output.scriptpubkey_address !== address) continue;
        const value = BigInt(output.value ?? 0);
        if (value <= 0n) continue;
        items.push({
          id: `bitcoin:${tx.txid}:${address}:${i}`,
          chain: "bitcoin",
          address,
          amount: formatSats(value),
          asset: "BTC",
          status,
          txHash: tx.txid,
          from,
          blockNumber: tx.status?.block_height,
          timestamp: tx.status?.block_time
            ? new Date(tx.status.block_time * 1000).toISOString()
            : undefined
        });
      }
      if (items.length >= limit) break;
    }

    return items.slice(0, limit);
  });
};

export const createBitcoinAdapter = (_config: BitcoinConfig): ChainAdapter => {
  const rpc = _config.rpc;

  return {
    chain: "bitcoin",
    async createWallet(label) {
      const keyPair = ECPair.makeRandom({ network: BTC_NETWORK });
      const privateKey = keyPair.privateKey;
      if (!privateKey || !keyPair.publicKey) {
        throw new Error("Failed to generate Bitcoin keypair");
      }
      const payment = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(keyPair.publicKey),
        network: BTC_NETWORK
      });
      if (!payment.address) throw new Error("Failed to derive Bitcoin address");
      return {
        wallet: {
          id: crypto.randomUUID(),
          address: payment.address,
          chain: "bitcoin",
          label,
          meta: { publicKey: toHex(keyPair.publicKey), segwit: "p2wpkh" }
        },
        secrets: { privateKey: toHex(privateKey) }
      };
    },
    async getBalance(wallet) {
      return withRpcFallback(rpc, async (endpoint) => {
        const data = await fetchJson<{
          chain_stats?: {
            funded_txo_sum?: number | string;
            spent_txo_sum?: number | string;
          };
          mempool_stats?: {
            funded_txo_sum?: number | string;
            spent_txo_sum?: number | string;
          };
        }>(toUrl(endpoint, `/address/${wallet.address}`));

        const confirmed =
          asBigInt(data.chain_stats?.funded_txo_sum) - asBigInt(data.chain_stats?.spent_txo_sum);
        const mempoolDelta =
          asBigInt(data.mempool_stats?.funded_txo_sum) -
          asBigInt(data.mempool_stats?.spent_txo_sum);

        return {
          amount: formatSats(confirmed + mempoolDelta),
          decimals: DECIMALS,
          symbol: "BTC"
        };
      });
    },
    async estimateFee(draft) {
      const amountSats = parseSats(draft.amount);
      if (amountSats <= 0n) throw new Error("amount must be > 0 for BTC transfer");
      return withRpcFallback(rpc, async (endpoint) => {
        const fees = await fetchJson<{
          fastestFee?: number;
          halfHourFee?: number;
          hourFee?: number;
        }>(toUrl(endpoint, "/v1/fees/recommended"));
        const satPerVb = Math.max(
          1,
          asNumber(fees.halfHourFee) || asNumber(fees.hourFee) || asNumber(fees.fastestFee)
        );
        const feeSats = estimateFeeSats(1, 2, satPerVb);
        return {
          amount: formatSats(feeSats),
          currency: "BTC",
          priority: "medium"
        };
      });
    },
    async sendTransaction(draft) {
      const suppliedRawTx = normalizeRawTx(draft);

      return withRpcFallback(rpc, async (endpoint) => {
        const signed = suppliedRawTx
          ? {
              rawTx: suppliedRawTx,
              txHash: (() => {
                try {
                  return bitcoin.Transaction.fromHex(suppliedRawTx).getId();
                } catch {
                  return undefined;
                }
              })()
            }
          : await buildAndSignTx(endpoint, draft);

        const res = await fetch(toUrl(endpoint, "/tx"), {
          method: "POST",
          body: signed.rawTx,
          headers: { "content-type": "text/plain" }
        });
        if (!res.ok) {
          throw new Error(`BTC broadcast failed (${res.status}): ${await res.text()}`);
        }
        const responseHash = (await res.text()).trim();
        const txHash = responseHash || signed.txHash;
        if (!txHash) throw new Error("BTC broadcast did not return transaction hash");
        return {
          txnId: draft.clientTxnId ?? txHash,
          txHash,
          status: "pending"
        };
      });
    },
    async getStatus(txnId): Promise<TxStatus> {
      return withRpcFallback(rpc, async (endpoint) => {
        const res = await fetch(toUrl(endpoint, `/tx/${txnId}/status`), { headers: jsonHeaders });
        if (res.status === 404) {
          return { txnId, status: "unknown" };
        }
        if (!res.ok) {
          throw new Error(`BTC status lookup failed (${res.status}): ${await res.text()}`);
        }
        const statusData = (await res.json()) as { confirmed?: boolean };
        return {
          txnId,
          txHash: txnId,
          status: statusData.confirmed ? "confirmed" : "pending"
        };
      });
    }
  };
};
