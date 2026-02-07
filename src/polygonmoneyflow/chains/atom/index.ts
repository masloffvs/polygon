import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { coin, SigningStargateClient } from "@cosmjs/stargate";
import { secp256k1 } from "@noble/curves/secp256k1";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { bech32 } from "@scure/base";
import {
  ChainAdapter,
  IncomingTx,
  TxDraft,
  TxStatus,
  WalletSecrets
} from "../common/chain-adapter";
import { withRpcFallback } from "../common/rpc";
import { ChainRpcConfig } from "../config";

export type AtomConfig = {
  rpc: ChainRpcConfig;
};

const DECIMALS = 6;
const BASE_DENOM = process.env.ATOM_BASE_DENOM ?? "uatom";
const SATS_PER_ATOM = 1_000_000n;
const DERIVATION_PATH = "m/44'/118'/0'/0/0";

const toUrl = (base: string, path: string): string =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const hash160 = (value: Uint8Array): Uint8Array => ripemd160(sha256(value));

const formatUnits = (value: bigint): string => {
  const whole = value / SATS_PER_ATOM;
  const frac = value % SATS_PER_ATOM;
  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString();
};

const parseUnits = (value: string): bigint => {
  const [whole, fraction = ""] = value.trim().split(".");
  const fractionPadded = (fraction + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(whole || "0") * SATS_PER_ATOM + BigInt(fractionPadded || "0");
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
  if (/^[0-9a-fA-F]+$/.test(rawTx)) {
    return Buffer.from(rawTx, "hex").toString("base64");
  }
  return rawTx;
};

const mapTxStatus = (code: bigint | number, height?: string | number): TxStatus["status"] => {
  if (Number(code) > 0) return "failed";
  if (height && String(height) !== "0") return "confirmed";
  return "pending";
};

const resolveSignerRpcEndpoint = (rpc: ChainRpcConfig): string | undefined => {
  const explicit = process.env.ATOM_TENDERMINT_RPC_URL ?? process.env.ATOM_SIGNER_RPC_URL;
  if (explicit?.trim()) return explicit.trim();
  if (rpc.primary.includes("/cosmos/")) return undefined;
  return rpc.primary;
};

const resolveSigner = async (
  secrets: WalletSecrets | undefined
): Promise<DirectSecp256k1HdWallet | DirectSecp256k1Wallet> => {
  const mnemonic = secrets?.mnemonic?.trim();
  if (mnemonic) {
    return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "cosmos" });
  }
  const privateKey = secrets?.privateKey?.trim();
  if (privateKey && /^[0-9a-fA-F]{64}$/.test(privateKey)) {
    return DirectSecp256k1Wallet.fromKey(Buffer.from(privateKey, "hex"), "cosmos");
  }
  throw new Error(
    "ATOM native signing requires mnemonic or privateKey in secrets; or provide rawTx."
  );
};

const parseDenomAmount = (raw: string): Array<{ amount: bigint; denom: string }> => {
  const parts = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  const parsed: Array<{ amount: bigint; denom: string }> = [];
  for (const part of parts) {
    const match = part.match(/^(\d+)([a-zA-Z0-9/._:-]+)$/);
    if (!match) continue;
    parsed.push({ amount: BigInt(match[1]), denom: match[2] });
  }
  return parsed;
};

export const listIncomingTransactions = async (
  config: AtomConfig,
  address: string,
  limit = 20
): Promise<IncomingTx[]> => {
  return withRpcFallback(config.rpc, async (endpoint) => {
    const event = encodeURIComponent(`transfer.recipient='${address}'`);
    const url = toUrl(
      endpoint,
      `/cosmos/tx/v1beta1/txs?events=${event}&pagination.limit=${Math.max(
        1,
        limit
      )}&order_by=ORDER_BY_DESC`
    );
    const res = await fetch(url, { headers: { "content-type": "application/json" } });
    if (!res.ok) {
      throw new Error(`ATOM incoming lookup failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      tx_responses?: Array<{
        txhash?: string;
        code?: number | string;
        height?: string | number;
        timestamp?: string;
        logs?: Array<{
          events?: Array<{
            type?: string;
            attributes?: Array<{ key?: string; value?: string }>;
          }>;
        }>;
      }>;
    };

    const items: IncomingTx[] = [];
    const responses = data.tx_responses ?? [];
    for (const tx of responses) {
      const status = Number(tx.code ?? 0) === 0 ? "confirmed" : "failed";
      const txHash = tx.txhash;
      if (!txHash) continue;
      const logs = tx.logs ?? [];
      for (const log of logs) {
        const events = log.events ?? [];
        for (const eventItem of events) {
          if (eventItem.type !== "transfer") continue;
          const attrs = eventItem.attributes ?? [];
          const recipient = attrs.find((attr) => attr.key === "recipient")?.value;
          if (recipient !== address) continue;
          const sender = attrs.find((attr) => attr.key === "sender")?.value;
          const amountRaw = attrs.find((attr) => attr.key === "amount")?.value ?? "";
          for (const entry of parseDenomAmount(amountRaw)) {
            if (entry.amount <= 0n) continue;
            if (entry.denom !== BASE_DENOM && entry.denom !== "uatom") continue;
            items.push({
              id: `atom:${txHash}:${address}:${items.length}`,
              chain: "atom",
              address,
              amount: formatUnits(entry.amount),
              asset: "ATOM",
              status,
              txHash,
              from: sender,
              blockNumber: Number(tx.height ?? 0) || undefined,
              timestamp: tx.timestamp
            });
            if (items.length >= limit) return items;
          }
        }
      }
    }

    return items.slice(0, limit);
  });
};

export const createAtomAdapter = (_config: AtomConfig): ChainAdapter => {
  const rpc = _config.rpc;

  return {
    chain: "atom",
    async createWallet(label) {
      const mnemonic = generateMnemonic(wordlist);
      const seed = mnemonicToSeedSync(mnemonic);
      const master = HDKey.fromMasterSeed(seed);
      const child = master.derive(DERIVATION_PATH);
      if (!child.privateKey) {
        throw new Error("Failed to derive ATOM private key");
      }
      const publicKey = secp256k1.getPublicKey(child.privateKey, true);
      const address = bech32.encode("cosmos", bech32.toWords(hash160(publicKey)));
      const privateKey = bytesToHex(child.privateKey);
      return {
        wallet: {
          id: crypto.randomUUID(),
          address,
          chain: "atom",
          label,
          meta: {
            publicKey: bytesToHex(publicKey),
            derivationPath: DERIVATION_PATH,
            denom: BASE_DENOM
          }
        },
        secrets: { mnemonic, privateKey }
      };
    },
    async getBalance(wallet) {
      return withRpcFallback(rpc, async (endpoint) => {
        const res = await fetch(toUrl(endpoint, `/cosmos/bank/v1beta1/balances/${wallet.address}`));
        if (!res.ok) {
          throw new Error(`ATOM balance lookup failed (${res.status}): ${await res.text()}`);
        }
        const data = (await res.json()) as {
          balances?: Array<{ denom?: string; amount?: string }>;
        };
        const balanceEntry =
          data.balances?.find((entry) => entry.denom === BASE_DENOM) ??
          data.balances?.find((entry) => entry.denom === "uatom");
        const amount = asBigInt(balanceEntry?.amount);
        return {
          amount: formatUnits(amount),
          decimals: DECIMALS,
          symbol: "ATOM"
        };
      });
    },
    async estimateFee(draft) {
      const amount = parseUnits(draft.amount);
      if (amount <= 0n) throw new Error("amount must be > 0 for ATOM transfer");
      const feeUatom = BigInt(process.env.ATOM_DEFAULT_FEE_UATOM ?? "5000");
      return {
        amount: formatUnits(feeUatom),
        currency: "ATOM",
        priority: "medium"
      };
    },
    async sendTransaction(draft) {
      const txBytes = normalizeRawTx(draft);
      if (txBytes) {
        return withRpcFallback(rpc, async (endpoint) => {
          const res = await fetch(toUrl(endpoint, "/cosmos/tx/v1beta1/txs"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tx_bytes: txBytes,
              mode: "BROADCAST_MODE_SYNC"
            })
          });
          if (!res.ok) {
            throw new Error(`ATOM broadcast failed (${res.status}): ${await res.text()}`);
          }
          const data = (await res.json()) as {
            tx_response?: {
              txhash?: string;
              code?: number | string;
              raw_log?: string;
              height?: string | number;
            };
          };
          const txResponse = data.tx_response;
          const txHash = txResponse?.txhash;
          if (!txHash) throw new Error("ATOM broadcast did not return txhash");
          const code = asBigInt(txResponse?.code);
          const status = mapTxStatus(Number(code), txResponse?.height);
          return {
            txnId: draft.clientTxnId ?? txHash,
            txHash,
            status,
            error: status === "failed" ? txResponse?.raw_log : undefined
          };
        });
      }

      if (!draft.to?.trim()) {
        throw new Error("ATOM send requires `to` address unless rawTx is provided.");
      }

      const amount = parseUnits(draft.amount);
      if (amount <= 0n) throw new Error("amount must be > 0 for ATOM transfer");

      const signerRpc = resolveSignerRpcEndpoint(rpc);
      if (!signerRpc) {
        throw new Error(
          "Set ATOM_TENDERMINT_RPC_URL (or ATOM_SIGNER_RPC_URL) for native ATOM signing, or provide rawTx."
        );
      }

      const signer = await resolveSigner(draft.secrets);
      const accounts = await signer.getAccounts();
      const signerAddress = accounts[0]?.address;
      if (!signerAddress) throw new Error("Unable to resolve signer address for ATOM send");

      const fromAddress = draft.from.address.startsWith("rawtx:") ? signerAddress : draft.from.address;
      if (fromAddress !== signerAddress) {
        throw new Error("Provided ATOM wallet address does not match signing key");
      }

      const feeAmount = (process.env.ATOM_DEFAULT_FEE_UATOM ?? "5000").trim();
      const gas = (process.env.ATOM_DEFAULT_GAS ?? "200000").trim();
      const memo = process.env.ATOM_DEFAULT_MEMO ?? "";

      const client = await SigningStargateClient.connectWithSigner(signerRpc, signer);
      try {
        const result = await client.sendTokens(
          fromAddress,
          draft.to,
          [coin(amount.toString(), BASE_DENOM)],
          {
            amount: [coin(feeAmount, BASE_DENOM)],
            gas
          },
          memo
        );
        const status = result.code === 0 ? "confirmed" : "failed";
        return {
          txnId: draft.clientTxnId ?? result.transactionHash,
          txHash: result.transactionHash,
          status,
          error: status === "failed" ? result.rawLog : undefined
        };
      } finally {
        client.disconnect();
      }
    },
    async getStatus(txnId): Promise<TxStatus> {
      return withRpcFallback(rpc, async (endpoint) => {
        const res = await fetch(toUrl(endpoint, `/cosmos/tx/v1beta1/txs/${txnId}`), {
          headers: { "content-type": "application/json" }
        });
        if (res.status === 404) return { txnId, txHash: txnId, status: "pending" };
        if (!res.ok) {
          throw new Error(`ATOM status lookup failed (${res.status}): ${await res.text()}`);
        }
        const data = (await res.json()) as {
          tx_response?: {
            code?: number | string;
            raw_log?: string;
            height?: string | number;
          };
        };
        const txResponse = data.tx_response ?? {};
        const code = asBigInt(txResponse.code);
        const status = mapTxStatus(Number(code), txResponse.height);
        return {
          txnId,
          txHash: txnId,
          status,
          error: status === "failed" ? txResponse.raw_log : undefined
        };
      });
    }
  };
};
