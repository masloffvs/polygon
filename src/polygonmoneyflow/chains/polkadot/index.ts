import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, mnemonicGenerate } from "@polkadot/util-crypto";
import { ChainAdapter, IncomingTx, TxStatus, WalletSecrets } from "../common/chain-adapter";
import { withRpcFallback } from "../common/rpc";
import { ChainRpcConfig } from "../config";

export type PolkadotConfig = {
  rpc: ChainRpcConfig;
  ss58Prefix?: number;
};

const DEFAULT_DECIMALS = 10;
const DEFAULT_SYMBOL = "DOT";
const DEFAULT_SS58_PREFIX = 0;
const DEFAULT_INCOMING_LOOKBACK = 120;
const DEFAULT_STATUS_LOOKBACK = 120;

const withApi = async <T>(
  rpc: ChainRpcConfig,
  fn: (api: ApiPromise) => Promise<T>
): Promise<T> =>
  withRpcFallback(rpc, async (endpoint) => {
    const provider = new WsProvider(endpoint);
    const api = await ApiPromise.create({ provider });
    try {
      return await fn(api);
    } finally {
      await api.disconnect();
    }
  });

const formatUnits = (value: bigint, decimals: number): string => {
  if (decimals <= 0) return value.toString();
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fractionStr.length ? `${whole}.${fractionStr}` : whole.toString();
};

const parseUnits = (value: string, decimals: number): bigint => {
  const [whole, fraction = ""] = value.split(".");
  if (decimals <= 0) return BigInt(whole || "0");
  const base = 10n ** BigInt(decimals);
  const fractionPadded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const wholePart = BigInt(whole || "0") * base;
  const fractionPart = BigInt(fractionPadded || "0");
  return wholePart + fractionPart;
};

const toBigInt = (value: { toString(): string }): bigint => BigInt(value.toString());

const getChainMeta = (api: ApiPromise) => {
  const decimals = api.registry.chainDecimals?.[0] ?? DEFAULT_DECIMALS;
  const symbol = api.registry.chainTokens?.[0] ?? DEFAULT_SYMBOL;
  return { decimals, symbol };
};

const decodeDispatchError = (api: ApiPromise, error: unknown): string => {
  if (!error) return "ExtrinsicFailed";
  const dispatchError = error as { isModule?: boolean; asModule?: unknown; toString(): string };
  if (dispatchError.isModule && dispatchError.asModule) {
    const decoded = api.registry.findMetaError(dispatchError.asModule);
    return `${decoded.section}.${decoded.name}`;
  }
  return dispatchError.toString();
};

const findExtrinsicOutcome = (
  api: ApiPromise,
  events: Array<{ event: { section: string; method: string; data: unknown[] }; phase: any }>,
  extrinsicIndex: number
): { status: "confirmed" | "failed"; error?: string } | undefined => {
  for (const record of events) {
    const phase = record.phase;
    if (!phase?.isApplyExtrinsic) continue;
    if (phase.asApplyExtrinsic.toNumber() !== extrinsicIndex) continue;
    const { section, method, data } = record.event;
    if (section !== "system") continue;
    if (method === "ExtrinsicSuccess") return { status: "confirmed" };
    if (method === "ExtrinsicFailed") {
      const error = data?.[0];
      return { status: "failed", error: decodeDispatchError(api, error) };
    }
  }
  return undefined;
};

const resolveSigningSecret = (secrets?: WalletSecrets): string => {
  const secret = secrets?.mnemonic ?? secrets?.seed ?? secrets?.privateKey;
  if (!secret) {
    throw new Error("mnemonic, seed, or privateKey is required for Polkadot transactions");
  }
  return secret;
};

export const listIncomingTransactions = async (
  config: PolkadotConfig,
  address: string,
  limit = 20
): Promise<IncomingTx[]> => {
  return withApi(config.rpc, async (api) => {
    const { decimals, symbol } = getChainMeta(api);
    const header = await api.rpc.chain.getHeader();
    const latest = header.number.toNumber();
    const start = Math.max(0, latest - DEFAULT_INCOMING_LOOKBACK);
    const items: IncomingTx[] = [];

    for (let blockNumber = latest; blockNumber >= start && items.length < limit; blockNumber -= 1) {
      const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
      const block = await api.rpc.chain.getBlock(blockHash);
      const events = await api.query.system.events.at(blockHash);
      const timestampValue = api.query.timestamp?.now
        ? await api.query.timestamp.now.at(blockHash)
        : undefined;
      const timestamp = timestampValue
        ? new Date(timestampValue.toNumber()).toISOString()
        : undefined;

      for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
        const record = events[eventIndex];
        const phase = record.phase;
        if (!phase?.isApplyExtrinsic) continue;
        const event = record.event;
        if (event.section !== "balances" || event.method !== "Transfer") continue;
        const [from, to, value] = event.data as unknown as [unknown, unknown, unknown];
        if (to?.toString() !== address) continue;
        const extrinsicIndex = phase.asApplyExtrinsic.toNumber();
        const extrinsic = block.block.extrinsics[extrinsicIndex];
        const txHash = extrinsic?.hash?.toHex();
        if (!txHash) continue;
        items.push({
          id: `polkadot:${txHash}:${address}:${eventIndex}`,
          chain: "polkadot",
          address,
          amount: formatUnits(toBigInt(value as { toString(): string }), decimals),
          asset: symbol,
          status: "confirmed",
          txHash,
          from: from?.toString(),
          blockNumber,
          timestamp
        });
        if (items.length >= limit) break;
      }
    }

    return items;
  });
};

export const createPolkadotAdapter = (_config: PolkadotConfig): ChainAdapter => {
  const rpc = _config.rpc;
  const ss58Prefix = _config.ss58Prefix ?? DEFAULT_SS58_PREFIX;

  return {
    chain: "polkadot",
    async createWallet(label) {
      await cryptoWaitReady();
      const mnemonic = mnemonicGenerate();
      const keyring = new Keyring({ type: "sr25519", ss58Format: ss58Prefix });
      const pair = keyring.addFromUri(mnemonic);
      return {
        wallet: {
          id: crypto.randomUUID(),
          address: pair.address,
          chain: "polkadot",
          label
        },
        secrets: { mnemonic }
      };
    },
    async getBalance(wallet) {
      return withApi(rpc, async (api) => {
        const { decimals, symbol } = getChainMeta(api);
        const account = await api.query.system.account(wallet.address);
        const free = toBigInt(account.data.free);
        return {
          amount: formatUnits(free, decimals),
          decimals,
          symbol
        };
      });
    },
    async estimateFee(draft) {
      return withApi(rpc, async (api) => {
        const { decimals, symbol } = getChainMeta(api);
        const amount = parseUnits(draft.amount, decimals);
        const tx = api.tx.balances.transferAllowDeath(draft.to, amount.toString());
        const info = await tx.paymentInfo(draft.from.address);
        const fee = toBigInt(info.partialFee);
        return {
          amount: formatUnits(fee, decimals),
          currency: symbol,
          priority: "medium"
        };
      });
    },
    async sendTransaction(draft) {
      return withApi(rpc, async (api) => {
        await cryptoWaitReady();
        const { decimals } = getChainMeta(api);
        const secret = resolveSigningSecret(draft.secrets);
        const keyring = new Keyring({ type: "sr25519", ss58Format: ss58Prefix });
        const pair = keyring.addFromUri(secret);
        const amount = parseUnits(draft.amount, decimals);
        const tx = api.tx.balances.transferAllowDeath(draft.to, amount.toString());
        const hash = await tx.signAndSend(pair);
        const txHash = hash.toHex();
        return {
          txnId: draft.clientTxnId ?? txHash,
          txHash,
          status: "pending"
        };
      });
    },
    async getStatus(txnId): Promise<TxStatus> {
      return withApi(rpc, async (api) => {
        const header = await api.rpc.chain.getHeader();
        const latest = header.number.toNumber();
        const start = Math.max(0, latest - DEFAULT_STATUS_LOOKBACK);

        for (let blockNumber = latest; blockNumber >= start; blockNumber -= 1) {
          const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
          const block = await api.rpc.chain.getBlock(blockHash);
          const extrinsicIndex = block.block.extrinsics.findIndex(
            (extrinsic) => extrinsic.hash.toHex() === txnId
          );
          if (extrinsicIndex === -1) continue;
          const events = await api.query.system.events.at(blockHash);
          const outcome = findExtrinsicOutcome(api, events as any, extrinsicIndex);
          if (!outcome) {
            return { txnId, txHash: txnId, status: "pending" };
          }
          if (outcome.status === "failed") {
            return {
              txnId,
              txHash: txnId,
              status: "failed",
              error: outcome.error
            };
          }
          return { txnId, txHash: txnId, status: "confirmed" };
        }

        try {
          const pending = await api.rpc.author.pendingExtrinsics();
          if (pending.some((extrinsic) => extrinsic.hash.toHex() === txnId)) {
            return { txnId, txHash: txnId, status: "pending" };
          }
        } catch {
          // Ignore pending checks for nodes that do not expose author RPCs.
        }

        return { txnId, txHash: txnId, status: "unknown" };
      });
    }
  };
};
