import { AppConfig } from "../infra/config";
import { logger } from "../infra/logger";
import { listWallets } from "../infra/wallet-registry";
import { getCursor, recordIncomingTx, setCursor } from "../infra/txstore";
import { listIncomingTransactions as listAdaIncoming } from "../../chains/ada";
import { listIncomingTransactions as listAtomIncoming } from "../../chains/atom";
import { listIncomingTransactions as listBitcoinIncoming } from "../../chains/bitcoin";
import { scanEvmIncoming } from "../../chains/common/evm";
import { listIncomingTransactions as listLinkIncoming } from "../../chains/link";
import { listIncomingTransactions as listPolkadotIncoming } from "../../chains/polkadot";
import { listIncomingTransactions as listSolanaIncoming } from "../../chains/solana";
import { listIncomingTransactions as listTrxIncoming } from "../../chains/trx";
import { listIncomingTransactions as listXrpIncoming } from "../../chains/xrp";
import { ChainId, IncomingTx, Wallet } from "../../chains/common/chain-adapter";

type MonitorOptions = {
  intervalMs: number;
  perAddressLimit: number;
  evmBlocksPerPoll: number;
  evmLookback: number;
  rateLimitBackoffBaseMs: number;
  rateLimitBackoffMaxMs: number;
};

const defaultOptions = (): MonitorOptions => ({
  intervalMs: Number(process.env.MONITOR_INTERVAL_MS ?? "15000"),
  perAddressLimit: Number(process.env.MONITOR_LIMIT_PER_ADDRESS ?? "20"),
  evmBlocksPerPoll: Number(process.env.MONITOR_EVM_BLOCKS_PER_POLL ?? "20"),
  evmLookback: Number(process.env.MONITOR_EVM_LOOKBACK ?? "50"),
  rateLimitBackoffBaseMs: Number(process.env.MONITOR_RATE_LIMIT_BACKOFF_BASE_MS ?? "30000"),
  rateLimitBackoffMaxMs: Number(process.env.MONITOR_RATE_LIMIT_BACKOFF_MAX_MS ?? "300000")
});

type ChainBackoffState = {
  nextAttemptAtMs: number;
  backoffMs: number;
};

const getErrorText = (err: unknown): string => {
  if (err instanceof Error) {
    const cause = "cause" in err ? String((err as { cause?: unknown }).cause ?? "") : "";
    return `${err.name} ${err.message} ${cause}`.toLowerCase();
  }
  if (typeof err === "string") return err.toLowerCase();
  if (err && typeof err === "object") {
    const obj = err as {
      message?: unknown;
      details?: unknown;
      shortMessage?: unknown;
      code?: unknown;
    };
    return `${String(obj.message ?? "")} ${String(obj.details ?? "")} ${String(obj.shortMessage ?? "")} ${String(obj.code ?? "")}`.toLowerCase();
  }
  return "";
};

const isRateLimitError = (err: unknown): boolean => {
  const text = getErrorText(err);
  return (
    text.includes("too many requests") ||
    text.includes("rate limit") ||
    text.includes(" 429") ||
    text.includes("error\":{\"code\": 429")
  );
};

const groupByChain = (wallets: Wallet[]) => {
  const grouped = new Map<ChainId, Wallet[]>();
  for (const wallet of wallets) {
    const list = grouped.get(wallet.chain) ?? [];
    list.push(wallet);
    grouped.set(wallet.chain, list);
  }
  return grouped;
};

const buildWalletIdMap = (wallets: Wallet[]) => {
  const map = new Map<string, string>();
  for (const wallet of wallets) {
    map.set(wallet.address.toLowerCase(), wallet.id);
  }
  return map;
};

const buildWalletOwnerMap = (wallets: Wallet[]) => {
  const map = new Map<string, string>();
  for (const wallet of wallets) {
    if (!wallet.walletVirtualOwner) continue;
    map.set(wallet.address.toLowerCase(), wallet.walletVirtualOwner);
  }
  return map;
};

const pollEvmChain = async (
  chain: "eth" | "base" | "polygon",
  config: AppConfig,
  wallets: Wallet[],
  options: MonitorOptions
) => {
  if (!wallets.length) return;
  const addresses = wallets.map((wallet) => wallet.address);
  const walletIdByAddress = buildWalletIdMap(wallets);
  const walletOwnerByAddress = buildWalletOwnerMap(wallets);
  const cursorKey = `evm:${chain}`;
  const cursorRaw = await getCursor(cursorKey);
  const cursor = cursorRaw ? Number(cursorRaw) : undefined;
  const chainConfig = config.chains[chain];
  const chainName = chain === "eth" ? "Ethereum" : chain === "base" ? "Base" : "Polygon";
  const symbol = chain === "polygon" ? "MATIC" : "ETH";

  const result = await scanEvmIncoming({
    chain,
    chainId: chainConfig.chainId ?? (chain === "eth" ? 1 : chain === "base" ? 8453 : 137),
    chainName,
    symbol,
    rpc: chainConfig.rpc,
    addresses,
    cursor,
    maxBlocks: options.evmBlocksPerPoll,
    lookback: options.evmLookback,
    walletIdByAddress
  });

  for (const tx of result.items) {
    if (!tx.walletVirtualOwner) {
      const owner = walletOwnerByAddress.get(tx.address.toLowerCase());
      if (owner) tx.walletVirtualOwner = owner;
    }
    await recordIncomingTx(tx);
  }
  if (result.lastBlock !== undefined) {
    await setCursor(cursorKey, result.lastBlock.toString());
  }
};

const pollAddressChain = async (
  wallets: Wallet[],
  options: MonitorOptions,
  fetcher: (wallet: Wallet, limit: number) => Promise<IncomingTx[]>
) => {
  for (const wallet of wallets) {
    try {
      const txs = await fetcher(wallet, options.perAddressLimit);
      for (const tx of txs) {
        if (!tx.walletId) tx.walletId = wallet.id;
        if (!tx.walletVirtualOwner && wallet.walletVirtualOwner) {
          tx.walletVirtualOwner = wallet.walletVirtualOwner;
        }
        await recordIncomingTx(tx);
      }
    } catch (err) {
      if (isRateLimitError(err)) throw err;
      logger.error(
        { chain: wallet.chain, walletId: wallet.id, address: wallet.address, err },
        "monitor wallet poll failed"
      );
    }
  }
};

export const startMonitoring = (config: AppConfig, override?: Partial<MonitorOptions>) => {
  const options = { ...defaultOptions(), ...override };
  let running = false;
  let timer: NodeJS.Timeout | null = null;
  const backoffByChain = new Map<ChainId, ChainBackoffState>();

  const chainState = (chain: ChainId): ChainBackoffState => {
    const existing = backoffByChain.get(chain);
    if (existing) return existing;
    const state = { nextAttemptAtMs: 0, backoffMs: 0 };
    backoffByChain.set(chain, state);
    return state;
  };

  const runChainPoll = async (chain: ChainId, fn: () => Promise<void>) => {
    const now = Date.now();
    const state = chainState(chain);
    if (state.nextAttemptAtMs > now) return;

    try {
      await fn();
      if (state.backoffMs > 0 || state.nextAttemptAtMs > 0) {
        logger.info({ chain }, "monitor chain recovered");
      }
      state.backoffMs = 0;
      state.nextAttemptAtMs = 0;
    } catch (err) {
      if (isRateLimitError(err)) {
        const nextBackoff =
          state.backoffMs > 0
            ? Math.min(state.backoffMs * 2, options.rateLimitBackoffMaxMs)
            : options.rateLimitBackoffBaseMs;
        state.backoffMs = Math.max(nextBackoff, options.intervalMs);
        state.nextAttemptAtMs = Date.now() + state.backoffMs;
        logger.warn(
          {
            chain,
            backoffMs: state.backoffMs,
            nextAttemptAt: new Date(state.nextAttemptAtMs).toISOString(),
            err
          },
          "monitor chain rate-limited, applying backoff"
        );
        return;
      }

      logger.error({ chain, err }, "monitor chain poll failed");
    }
  };

  const pollOnce = async () => {
    if (running) return;
    running = true;
    try {
      const wallets = await listWallets();
      if (!wallets.length) {
        logger.debug("monitor: no wallets registered");
        return;
      }
      const grouped = groupByChain(wallets);

      await runChainPoll("eth", () => pollEvmChain("eth", config, grouped.get("eth") ?? [], options));
      await runChainPoll("base", () =>
        pollEvmChain("base", config, grouped.get("base") ?? [], options)
      );
      await runChainPoll("polygon", () =>
        pollEvmChain("polygon", config, grouped.get("polygon") ?? [], options)
      );

      await runChainPoll("solana", () =>
        pollAddressChain(grouped.get("solana") ?? [], options, (wallet, limit) =>
          listSolanaIncoming(config.chains.solana, wallet.address, limit)
        )
      );
      await runChainPoll("trx", () =>
        pollAddressChain(grouped.get("trx") ?? [], options, (wallet, limit) =>
          listTrxIncoming(config.chains.trx, wallet.address, limit)
        )
      );
      await runChainPoll("xrp", () =>
        pollAddressChain(grouped.get("xrp") ?? [], options, (wallet, limit) =>
          listXrpIncoming(config.chains.xrp, wallet.address, limit)
        )
      );
      await runChainPoll("polkadot", () =>
        pollAddressChain(grouped.get("polkadot") ?? [], options, (wallet, limit) =>
          listPolkadotIncoming(config.chains.polkadot, wallet.address, limit)
        )
      );
      await runChainPoll("bitcoin", () =>
        pollAddressChain(grouped.get("bitcoin") ?? [], options, (wallet, limit) =>
          listBitcoinIncoming(config.chains.bitcoin, wallet.address, limit)
        )
      );
      await runChainPoll("atom", () =>
        pollAddressChain(grouped.get("atom") ?? [], options, (wallet, limit) =>
          listAtomIncoming(config.chains.atom, wallet.address, limit)
        )
      );
      await runChainPoll("ada", () =>
        pollAddressChain(grouped.get("ada") ?? [], options, (wallet, limit) =>
          listAdaIncoming(config.chains.ada, wallet.address, limit)
        )
      );
      await runChainPoll("link", () =>
        pollAddressChain(grouped.get("link") ?? [], options, (wallet, limit) =>
          listLinkIncoming(
            {
              rpc: config.chains.link.rpc,
              chainId: config.chains.link.chainId ?? 1,
              tokenAddress: config.chains.link.tokenAddress
            },
            wallet.address,
            limit
          )
        )
      );
    } catch (err) {
      logger.error({ err }, "monitor poll failed");
    } finally {
      running = false;
    }
  };

  const start = () => {
    pollOnce().catch((err) => logger.error({ err }, "monitor initial poll failed"));
    timer = setInterval(() => {
      pollOnce().catch((err) => logger.error({ err }, "monitor poll failed"));
    }, options.intervalMs);
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  start();
  return { stop };
};
