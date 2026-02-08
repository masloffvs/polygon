import { ChainId, TxDraft, Wallet, WalletSecrets } from "../../chains/common/chain-adapter";
import { createChainRouter } from "../router";
import { AppConfig } from "../infra/config";
import { cacheBalance } from "../infra/balance-cache";
import { logger } from "../infra/logger";
import { BadRequestError, NotFoundError } from "../utils/errors";
import {
  findByAddress,
  getWallet as getStoredWallet,
  listInstitutionalWallets,
  saveWallet
} from "../infra/keystore";
import {
  findWalletByAddress as findRegisteredWalletByAddress,
  getWallet as getRegisteredWallet,
  listWallets as listRegisteredWallets,
  listWalletsByOwner,
  registerWallet
} from "../infra/wallet-registry";
import { listIncomingForAddress } from "../infra/txstore";

type CapabilityStatus = "full" | "partial" | "placeholder" | "not_implemented";
type ChainImplementationMode = "full" | "partial" | "placeholder";
type LiveStatus = "healthy" | "degraded" | "down" | "unknown";
type ProbeCheck = "ok" | "failed" | "skipped";

type ChainCapabilities = {
  createWallet: CapabilityStatus;
  getBalance: CapabilityStatus;
  estimateFee: CapabilityStatus;
  sendTransaction: CapabilityStatus;
  getStatus: CapabilityStatus;
  incomingMonitoring: CapabilityStatus;
};

type ChainLiveReport = {
  status: LiveStatus;
  latencyMs?: number;
  checks: {
    createWallet: ProbeCheck;
    getBalance: ProbeCheck;
    estimateFee: ProbeCheck;
  };
  error?: string;
};

type RefinanceTransferItem = {
  walletId: string;
  fromAddress: string;
  amount: string;
  feeReserved: string;
  feeCurrency: string;
  txnId: string;
  txHash?: string;
  status: "pending" | "confirmed" | "failed" | "unknown";
};

export type RefinanceTransferResult = {
  chain: ChainId;
  asset?: string;
  to: string;
  requestedAmount: string;
  transferredAmount: string;
  remainingAmount: string;
  allowSplit: boolean;
  transfers: RefinanceTransferItem[];
  txHashes: string[];
  walletsConsidered: number;
  walletsWithHistory: number;
  walletsWithLiquidity: number;
};

export type ReindexBalanceTarget = {
  chain: ChainId;
  idOrAddress: string;
  asset?: string;
};

export type ReindexBalanceItem = {
  chain: ChainId;
  idOrAddress: string;
  walletId?: string;
  address?: string;
  asset?: string;
  balance?: {
    amount: string;
    decimals: number;
    symbol: string;
  };
  cachedAt?: string;
  status: "ok" | "error";
  error?: string;
};

export type ReindexBalancesResult = {
  items: ReindexBalanceItem[];
  total: number;
  success: number;
  failed: number;
};

export type ChainStatusReport = {
  chain: ChainId;
  mode: ChainImplementationMode;
  institutionalEnabled: boolean;
  rpc: {
    primary: string;
    fallbacks: number;
    timeoutMs: number;
  };
  capabilities: ChainCapabilities;
  limitations: string[];
  live: ChainLiveReport;
};

export const createWalletService = (config: AppConfig) => {
  const router = createChainRouter(config.chains);
  const institutionalChains = new Set(config.institutional.chains);
  const supportedChains = Object.keys(config.chains) as ChainId[];
  const monitoredChains = new Set<ChainId>([
    "eth",
    "base",
    "polygon",
    "solana",
    "trx",
    "xrp",
    "polkadot",
    "bitcoin",
    "atom",
    "ada",
    "link"
  ]);

  const normalizeAssets = (assets?: string[]) => {
    if (!assets) return undefined;
    const cleaned = assets
      .map((asset) => asset.trim().toUpperCase())
      .filter((asset) => asset.length > 0);
    if (!cleaned.length) return undefined;
    return Array.from(new Set(cleaned));
  };

  const normalizeSymbol = (value?: string): string => value?.trim().toUpperCase() ?? "";

  const parseUnits = (value: string, decimals: number): bigint => {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      throw new BadRequestError(`Invalid amount: ${value}`);
    }
    if (decimals <= 0) return BigInt(trimmed.split(".")[0] ?? "0");

    const [whole, fraction = ""] = trimmed.split(".");
    if (fraction.length > decimals) {
      throw new BadRequestError(
        `Amount ${value} exceeds supported precision (${decimals} decimals)`,
      );
    }
    const fractionPadded = (fraction + "0".repeat(decimals)).slice(0, decimals);
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fractionPadded || "0");
  };

  const formatUnits = (value: bigint, decimals: number): string => {
    if (decimals <= 0) return value.toString();
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const fraction = value % base;
    if (fraction === 0n) return whole.toString();
    const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fractionStr}`;
  };

  const defaultInstitutionalAssets = (chain: ChainId): string[] => {
    const defaults: Record<ChainId, string> = {
      solana: "SOL",
      eth: "ETH",
      base: "ETH",
      polygon: "MATIC",
      trx: "TRX",
      xrp: "XRP",
      polkadot: "DOT",
      ada: "ADA",
      atom: "ATOM",
      link: "LINK",
      bitcoin: "BTC",
      lightning: "BTC"
    };
    return [defaults[chain]];
  };

  const toInstitutionalMeta = (wallet: Wallet, assets?: string[]) => {
    const meta = wallet.meta && typeof wallet.meta === "object" ? wallet.meta : {};
    const allowed = normalizeAssets(assets);
    return {
      ...meta,
      institutional: true,
      institutionalAssets: allowed ?? defaultInstitutionalAssets(wallet.chain)
    };
  };

  const isInstitutionalWallet = (wallet: Wallet) => {
    if (!wallet.meta || typeof wallet.meta !== "object") return false;
    return (wallet.meta as Record<string, unknown>).institutional === true;
  };

  const getInstitutionalAssets = (wallet: Wallet): string[] | undefined => {
    if (!wallet.meta || typeof wallet.meta !== "object") return undefined;
    const assets = (wallet.meta as Record<string, unknown>).institutionalAssets;
    if (!Array.isArray(assets)) return undefined;
    return assets.filter((asset): asset is string => typeof asset === "string");
  };

  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  };

  const postJson = async (
    endpoint: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    label: string,
    headers?: Record<string, string>
  ) => {
    const res = await withTimeout(
      fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(headers ?? {})
        },
        body: JSON.stringify(body)
      }),
      timeoutMs,
      label
    );

    if (!res.ok) {
      throw new Error(`${label} failed with ${res.status}: ${await res.text()}`);
    }

    return (await res.json()) as Record<string, unknown>;
  };

  const getJson = async (
    endpoint: string,
    timeoutMs: number,
    label: string,
    headers?: Record<string, string>
  ) => {
    const res = await withTimeout(
      fetch(endpoint, {
        headers: headers ?? {}
      }),
      timeoutMs,
      label
    );

    if (!res.ok) {
      throw new Error(`${label} failed with ${res.status}: ${await res.text()}`);
    }

    return (await res.json()) as Record<string, unknown>;
  };

  const probeWsJsonRpc = async (
    endpoint: string,
    payload: Record<string, unknown>,
    timeoutMs: number,
    label: string
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(endpoint);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          socket.close();
        } catch {}
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.close();
        } catch {}
        if (error) reject(error);
        else resolve();
      };

      socket.onopen = () => {
        socket.send(JSON.stringify(payload));
      };

      socket.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : String(event.data ?? "");
        if (data.includes('"error"')) {
          finish(new Error(`${label} returned error payload: ${data.slice(0, 240)}`));
          return;
        }
        finish();
      };

      socket.onerror = () => {
        finish(new Error(`${label} failed`));
      };
    });

  const probeEndpoint = async (chain: ChainId, endpoint: string, timeoutMs: number) => {
    switch (chain) {
      case "solana": {
        const body = {
          jsonrpc: "2.0",
          id: 1,
          method: "getHealth",
          params: []
        };
        await postJson(endpoint, body, timeoutMs, `${chain}.getHealth`);
        return;
      }
      case "eth":
      case "base":
      case "polygon":
      case "link": {
        const body = {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: []
        };
        await postJson(endpoint, body, timeoutMs, `${chain}.eth_blockNumber`);
        return;
      }
      case "trx": {
        await postJson(
          endpoint.replace(/\/+$/, "") + "/wallet/getnowblock",
          {},
          timeoutMs,
          `${chain}.getnowblock`
        );
        return;
      }
      case "xrp": {
        const body = {
          method: "server_info",
          params: [{}]
        };
        await postJson(endpoint, body, timeoutMs, `${chain}.server_info`);
        return;
      }
      case "polkadot": {
        const body = {
          jsonrpc: "2.0",
          id: 1,
          method: "system_health",
          params: []
        };
        await probeWsJsonRpc(endpoint, body, timeoutMs, `${chain}.system_health`);
        return;
      }
      case "ada": {
        await getJson(endpoint.replace(/\/+$/, "") + "/tip", timeoutMs, `${chain}.tip`);
        return;
      }
      case "atom": {
        await getJson(
          endpoint.replace(/\/+$/, "") + "/cosmos/base/tendermint/v1beta1/node_info",
          timeoutMs,
          `${chain}.node_info`
        );
        return;
      }
      case "bitcoin": {
        const res = await withTimeout(
          fetch(endpoint.replace(/\/+$/, "") + "/blocks/tip/height"),
          timeoutMs,
          `${chain}.tip_height`
        );
        if (!res.ok) {
          throw new Error(`${chain}.tip_height failed with ${res.status}: ${await res.text()}`);
        }
        return;
      }
      case "lightning": {
        const macaroon = process.env.LIGHTNING_MACAROON?.trim();
        if (!macaroon) {
          throw new Error("LIGHTNING_MACAROON is not set");
        }
        await getJson(
          endpoint.replace(/\/+$/, "") + "/v1/getinfo",
          timeoutMs,
          `${chain}.getinfo`,
          { "Grpc-Metadata-macaroon": macaroon }
        );
        return;
      }
      default:
        throw new Error(`No probe configured for chain ${chain}`);
    }
  };

  const probeRpcHealth = async (chain: ChainId, timeoutMs: number): Promise<{
    status: "healthy" | "degraded" | "down";
    error?: string;
  }> => {
    const rpcConfig = config.chains[chain].rpc;
    const endpoints = [rpcConfig.primary, ...(rpcConfig.fallbacks ?? [])];
    const errors: string[] = [];

    for (let i = 0; i < endpoints.length; i += 1) {
      const endpoint = endpoints[i];
      try {
        await probeEndpoint(chain, endpoint, timeoutMs);
        if (i === 0) {
          return { status: "healthy" };
        }
        return {
          status: "degraded",
          error: `Primary endpoint failed, fallback endpoint #${i} succeeded.`
        };
      } catch (err) {
        errors.push((err as Error).message);
      }
    }

    return {
      status: "down",
      error: errors.join("; ")
    };
  };

  const buildCapabilities = (chain: ChainId): {
    mode: ChainImplementationMode;
    capabilities: ChainCapabilities;
    limitations: string[];
  } => {
    const capabilities: ChainCapabilities = {
      createWallet: "full",
      getBalance: "full",
      estimateFee: "full",
      sendTransaction: "full",
      getStatus: "full",
      incomingMonitoring: monitoredChains.has(chain) ? "full" : "not_implemented"
    };

    const limitations: string[] = [];
    let mode: ChainImplementationMode = "full";

    if (chain === "lightning" && !process.env.LIGHTNING_MACAROON?.trim()) {
      mode = "placeholder";
      capabilities.createWallet = "placeholder";
      capabilities.getBalance = "placeholder";
      capabilities.estimateFee = "placeholder";
      capabilities.sendTransaction = "placeholder";
      capabilities.getStatus = "placeholder";
      limitations.push(
        "LIGHTNING_MACAROON is not set; adapter works in placeholder mode."
      );
    }

    if (chain === "ada") {
      if (mode === "full") mode = "partial";
      capabilities.sendTransaction = mode === "placeholder" ? "placeholder" : "partial";
      limitations.push(
        "sendTransaction requires signed rawTx (CBOR hex) in request body."
      );
    }

    if (chain === "atom") {
      if (mode === "full") mode = "partial";
      capabilities.sendTransaction = mode === "placeholder" ? "placeholder" : "partial";
      limitations.push(
        "Native send requires ATOM_TENDERMINT_RPC_URL (or ATOM_SIGNER_RPC_URL); otherwise use rawTx."
      );
    }

    if (chain === "link") {
      if (mode === "full") mode = "partial";
      capabilities.getBalance = "partial";
      capabilities.estimateFee = "partial";
      capabilities.sendTransaction = "partial";
      limitations.push("LINK adapter supports LINK token operations only.");
    }

    if (!monitoredChains.has(chain)) {
      limitations.push("Incoming transaction monitoring is not implemented for this chain.");
    }

    return { mode, capabilities, limitations };
  };

  const probeChain = async (
    chain: ChainId,
    includeLive: boolean,
    timeoutMs: number,
    mode: ChainImplementationMode
  ): Promise<ChainLiveReport> => {
    const checks: ChainLiveReport["checks"] = {
      createWallet: "skipped",
      getBalance: "skipped",
      estimateFee: "skipped"
    };

    if (!includeLive) {
      return { status: "unknown", checks };
    }

    const startedAt = Date.now();
    checks.createWallet = mode === "placeholder" ? "skipped" : "ok";

    const rpcHealth = await probeRpcHealth(chain, timeoutMs);
    checks.getBalance = rpcHealth.status === "down" ? "failed" : "ok";
    checks.estimateFee = rpcHealth.status === "down" ? "failed" : "ok";

    const status =
      mode === "placeholder"
        ? "degraded"
        : rpcHealth.status;

    return {
      status,
      latencyMs: Date.now() - startedAt,
      checks,
      error:
        mode === "placeholder"
          ? rpcHealth.error
            ? `Adapter runs in placeholder mode. ${rpcHealth.error}`
            : "Adapter runs in placeholder mode."
          : rpcHealth.error
    };
  };

  const getChainsStatus = async (opts?: {
    includeLive?: boolean;
    timeoutMs?: number;
  }): Promise<ChainStatusReport[]> => {
    const includeLive = opts?.includeLive ?? true;
    const timeoutMs = Math.min(Math.max(opts?.timeoutMs ?? 6_000, 500), 20_000);

    const reports = await Promise.all(
      supportedChains.map(async (chain) => {
        const implementation = buildCapabilities(chain);
        const chainConfig = config.chains[chain];
        const live = await probeChain(chain, includeLive, timeoutMs, implementation.mode);
        return {
          chain,
          mode: implementation.mode,
          institutionalEnabled: institutionalChains.has(chain),
          rpc: {
            primary: chainConfig.rpc.primary,
            fallbacks: chainConfig.rpc.fallbacks?.length ?? 0,
            timeoutMs: chainConfig.rpc.timeoutMs ?? 8_000
          },
          capabilities: implementation.capabilities,
          limitations: implementation.limitations,
          live
        } satisfies ChainStatusReport;
      })
    );

    return reports;
  };

  const createWallet = async (chain: ChainId, label?: string) => {
    const { wallet, secrets } = await router.get(chain).createWallet(label);
    const createdAt = wallet.createdAt ?? new Date().toISOString();
    const nextWallet = { ...wallet, createdAt };
    await saveWallet({ ...nextWallet, secrets });
    await registerWallet(nextWallet);
    return nextWallet;
  };

  const createInstitutionalWallet = async (
    chain: ChainId,
    label?: string,
    assets?: string[]
  ) => {
    if (!institutionalChains.has(chain)) {
      throw new BadRequestError(
        `Institutional wallets are only supported for: ${Array.from(institutionalChains).join(
          ", "
        )}`
      );
    }
    const { wallet, secrets } = await router.get(chain).createWallet(label);
    const createdAt = wallet.createdAt ?? new Date().toISOString();
    const meta = toInstitutionalMeta(wallet, assets);
    const nextWallet: Wallet = { ...wallet, createdAt, meta };
    await saveWallet({ ...nextWallet, secrets });
    return nextWallet;
  };

  const createVirtualOwnedWallets = async (
    owner: string,
    chains: ChainId[]
  ): Promise<{ owner: string; wallets: Array<Wallet & { created: boolean }> }> => {
    const normalizedOwner = owner.trim().toLowerCase();
    if (!normalizedOwner) throw new BadRequestError("owner is required");

    const existing = await listWalletsByOwner(normalizedOwner);
    const byChain = new Map<ChainId, Wallet>();
    for (const wallet of existing) {
      if (!byChain.has(wallet.chain)) {
        byChain.set(wallet.chain, wallet);
      }
    }

    const wallets: Array<Wallet & { created: boolean }> = [];
    for (const chain of chains) {
      const current = byChain.get(chain);
      if (current) {
        wallets.push({ ...current, created: false });
        continue;
      }
      const { wallet, secrets } = await router.get(chain).createWallet();
      const createdAt = wallet.createdAt ?? new Date().toISOString();
      const nextWallet: Wallet = {
        ...wallet,
        createdAt,
        walletVirtualOwner: normalizedOwner
      };
      await saveWallet({ ...nextWallet, secrets });
      await registerWallet(nextWallet);
      wallets.push({ ...nextWallet, created: true });
    }

    return { owner: normalizedOwner, wallets };
  };

  const resolveWallet = async (
    chain: ChainId,
    opts: { walletId?: string; address?: string; secrets?: WalletSecrets }
  ) => {
    if (opts.walletId) {
      const stored = await getStoredWallet(opts.walletId);
      if (stored) {
        if (stored.chain !== chain) {
          throw new BadRequestError(
            `Wallet ${opts.walletId} belongs to chain ${stored.chain}, requested ${chain}`,
          );
        }
        return stored;
      }

      const registered = await getRegisteredWallet(opts.walletId);
      if (registered) {
        if (registered.chain !== chain) {
          throw new BadRequestError(
            `Wallet ${opts.walletId} belongs to chain ${registered.chain}, requested ${chain}`,
          );
        }
        return registered;
      }

      if (!opts.address) throw new NotFoundError(`Wallet ${opts.walletId} not found`);
    }
    if (opts.address) {
      const normalizedAddress = opts.address.trim();
      const stored = await findByAddress(chain, normalizedAddress);
      if (stored) return stored;
      const registered = await findRegisteredWalletByAddress(chain, normalizedAddress);
      if (registered) return registered;
      if (opts.secrets) {
        return {
          id: normalizedAddress,
          address: normalizedAddress,
          chain,
          secrets: opts.secrets
        };
      }
      return { id: normalizedAddress, address: normalizedAddress, chain };
    }
    throw new BadRequestError("walletId or address is required");
  };

  const getBalance = async (chain: ChainId, walletIdOrAddress: string, asset?: string) => {
    const wallet = await resolveWallet(chain, {
      walletId: walletIdOrAddress,
      address: walletIdOrAddress
    });
    const balance = await router.get(chain).getBalance(wallet, asset);
    try {
      await cacheBalance({
        chain,
        walletId: wallet.id,
        address: wallet.address,
        asset,
        balance,
        cachedAt: new Date().toISOString()
      });
    } catch (err) {
      logger.warn(
        {
          chain,
          walletId: wallet.id,
          address: wallet.address,
          err: err instanceof Error ? err.message : String(err)
        },
        "failed to cache wallet balance snapshot"
      );
    }
    return balance;
  };

  const reindexBalances = async (params: {
    wallets: ReindexBalanceTarget[];
  }): Promise<ReindexBalancesResult> => {
    const targets = params.wallets;
    if (!targets.length) {
      throw new BadRequestError("wallets must contain at least one item");
    }
    if (targets.length > 500) {
      throw new BadRequestError("wallets limit exceeded (max 500 items)");
    }

    const items: ReindexBalanceItem[] = [];

    for (const target of targets) {
      const idOrAddress = target.idOrAddress?.trim();
      if (!idOrAddress) {
        items.push({
          chain: target.chain,
          idOrAddress: target.idOrAddress ?? "",
          asset: target.asset,
          status: "error",
          error: "idOrAddress is required"
        });
        continue;
      }

      try {
        const wallet = await resolveWallet(target.chain, {
          walletId: idOrAddress,
          address: idOrAddress
        });
        const balance = await router.get(target.chain).getBalance(wallet, target.asset);
        const cachedAt = new Date().toISOString();
        await cacheBalance({
          chain: target.chain,
          walletId: wallet.id,
          address: wallet.address,
          asset: target.asset,
          balance,
          cachedAt
        });
        items.push({
          chain: target.chain,
          idOrAddress,
          walletId: wallet.id,
          address: wallet.address,
          asset: target.asset,
          balance,
          cachedAt,
          status: "ok"
        });
      } catch (err) {
        items.push({
          chain: target.chain,
          idOrAddress,
          asset: target.asset,
          status: "error",
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const success = items.filter((item) => item.status === "ok").length;
    return {
      items,
      total: items.length,
      success,
      failed: items.length - success
    };
  };

  const estimateFee = async (
    chain: ChainId,
    params: { walletId?: string; address?: string; to: string; amount: string; asset?: string }
  ) => {
    const from = await resolveWallet(chain, {
      walletId: params.walletId,
      address: params.address
    });
    const draft: TxDraft = { from, to: params.to, amount: params.amount, asset: params.asset };
    return router.get(chain).estimateFee(draft);
  };

  const sendTransaction = async (
    chain: ChainId,
    params: {
      walletId?: string;
      address?: string;
      to: string;
      amount: string;
      asset?: string;
      rawTx?: string;
      clientTxnId?: string;
      secrets?: WalletSecrets;
    }
  ) => {
    const from =
      params.walletId || params.address
        ? await resolveWallet(chain, {
            walletId: params.walletId,
            address: params.address,
            secrets: params.secrets
          })
        : params.rawTx
          ? ({
              id: `rawtx:${chain}`,
              address: `rawtx:${chain}`,
              chain
            } as Wallet)
          : (() => {
              throw new BadRequestError("walletId or address is required");
            })();
    if (isInstitutionalWallet(from)) {
      const allowedAssets = getInstitutionalAssets(from);
      const asset = params.asset?.trim().toUpperCase();
      if (asset && allowedAssets && !allowedAssets.includes(asset)) {
        throw new BadRequestError(`Asset ${asset} is not allowed for this wallet`);
      }
    }
    const draft: TxDraft = {
      from,
      to: params.to,
      amount: params.amount,
      asset: params.asset,
      rawTx: params.rawTx,
      clientTxnId: params.clientTxnId,
      secrets: params.secrets ?? from.secrets
    };
    try {
      return await router.get(chain).sendTransaction(draft);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        chain === "solana" &&
        /insufficient funds for rent|minimum first transfer is/i.test(message)
      ) {
        throw new BadRequestError(
          "Solana destination is unfunded and requires a higher first transfer (rent-exempt minimum is about 0.00089 SOL). Increase amount or fund recipient first.",
        );
      }
      throw err;
    }
  };

  const refinanceTransfer = async (
    chain: ChainId,
    params: {
      to: string;
      amount: string;
      allowSplit?: boolean;
      asset?: string;
    }
  ): Promise<RefinanceTransferResult> => {
    const to = params.to?.trim();
    const amountRaw = params.amount?.trim();
    const allowSplit = params.allowSplit === true;
    const asset = (params.asset?.trim() || (chain === "link" ? "LINK" : "")).trim() || undefined;

    if (!to) throw new BadRequestError("to is required");
    if (!amountRaw) throw new BadRequestError("amount is required");
    if (chain === "ada") {
      throw new BadRequestError(
        "refinanceTransfer is not available for ADA: adapter requires signed rawTx for sends.",
      );
    }

    const wallets = (await listRegisteredWallets()).filter((wallet) => wallet.chain === chain);
    const walletsConsidered = wallets.length;
    if (!wallets.length) {
      throw new NotFoundError(`No wallets registered for chain ${chain}`);
    }

    const candidates: Array<{
      wallet: Wallet;
      decimals: number;
      symbol: string;
      balanceUnits: bigint;
      spendableUnits: bigint;
      feeUnitsReserved: bigint;
      feeCurrency: string;
    }> = [];

    let walletsWithHistory = 0;
    let walletsWithSecrets = 0;
    let walletsWithLiquidity = 0;
    let feeEstimateFailures = 0;

    for (const wallet of wallets) {
      const incoming = await listIncomingForAddress(chain, wallet.address, 1);
      if (!incoming.length) continue;
      walletsWithHistory += 1;

      const stored = await getStoredWallet(wallet.id);
      if (!stored?.secrets) continue;
      walletsWithSecrets += 1;

      let balance:
        | {
            amount: string;
            decimals: number;
            symbol: string;
          }
        | undefined;
      try {
        balance = await router.get(chain).getBalance(stored, asset);
      } catch {
        continue;
      }

      const balanceUnits = parseUnits(balance.amount, balance.decimals);
      if (balanceUnits <= 0n) continue;

      let feeUnitsReserved = 0n;
      let feeCurrency = balance.symbol;
      try {
        const fee = await router.get(chain).estimateFee({
          from: stored,
          to,
          amount: amountRaw,
          asset
        });
        feeCurrency = fee.currency;
        if (normalizeSymbol(fee.currency) === normalizeSymbol(balance.symbol)) {
          feeUnitsReserved = parseUnits(fee.amount, balance.decimals);
        }
      } catch (err) {
        feeEstimateFailures += 1;
        logger.warn(
          {
            chain,
            walletId: stored.id,
            address: stored.address,
            err: err instanceof Error ? err.message : String(err)
          },
          "refinanceTransfer fee estimate failed, continuing with zero reserved fee"
        );
      }

      const spendableUnits = balanceUnits - feeUnitsReserved;
      if (spendableUnits <= 0n) continue;

      walletsWithLiquidity += 1;
      candidates.push({
        wallet: stored,
        decimals: balance.decimals,
        symbol: balance.symbol,
        balanceUnits,
        spendableUnits,
        feeUnitsReserved,
        feeCurrency
      });
    }

    if (!candidates.length) {
      const details = {
        chain,
        walletsConsidered,
        walletsWithHistory,
        walletsWithSecrets,
        walletsWithLiquidity,
        feeEstimateFailures
      };
      if (walletsWithHistory > 0 && walletsWithSecrets === 0) {
        throw new BadRequestError(
          `Wallets with incoming history were found for ${chain}, but none have signing secrets in keystore`,
        );
      }
      throw new BadRequestError(
        `No funded wallets with cached incoming history were found for ${chain}. Details: ${JSON.stringify(
          details,
        )}`,
      );
    }

    const decimals = candidates[0]!.decimals;
    const symbol = normalizeSymbol(candidates[0]!.symbol);
    const requiredUnits = parseUnits(amountRaw, decimals);
    if (requiredUnits <= 0n) {
      throw new BadRequestError("amount must be greater than 0");
    }

    const compatible = candidates
      .filter(
        (candidate) =>
          candidate.decimals === decimals &&
          normalizeSymbol(candidate.symbol) === symbol,
      )
      .sort((a, b) => {
        if (a.spendableUnits === b.spendableUnits) {
          if (a.balanceUnits === b.balanceUnits) {
            return a.wallet.address.localeCompare(b.wallet.address);
          }
          return a.balanceUnits < b.balanceUnits ? -1 : 1;
        }
        return a.spendableUnits < b.spendableUnits ? -1 : 1;
      });

    if (!compatible.length) {
      throw new BadRequestError(
        `No compatible wallets found for transfer asset on ${chain} (${symbol})`,
      );
    }

    const plan: Array<{
      candidate: (typeof compatible)[number];
      amountUnits: bigint;
    }> = [];

    if (!allowSplit) {
      const single = compatible.find((candidate) => candidate.spendableUnits >= requiredUnits);
      if (!single) {
        throw new BadRequestError(
          `Insufficient single-wallet liquidity for ${amountRaw} ${symbol}. Enable allowSplit to aggregate balances.`,
        );
      }
      plan.push({ candidate: single, amountUnits: requiredUnits });
    } else {
      let remaining = requiredUnits;
      for (const candidate of compatible) {
        if (remaining <= 0n) break;
        const amountUnits =
          candidate.spendableUnits < remaining ? candidate.spendableUnits : remaining;
        if (amountUnits <= 0n) continue;
        plan.push({ candidate, amountUnits });
        remaining -= amountUnits;
      }
      if (remaining > 0n) {
        throw new BadRequestError(
          `Insufficient aggregated liquidity for ${amountRaw} ${symbol}. Missing ${formatUnits(
            remaining,
            decimals,
          )} ${symbol}.`,
        );
      }
    }

    const transfers: RefinanceTransferItem[] = [];
    const txHashes: string[] = [];
    let transferredUnits = 0n;

    for (const leg of plan) {
      const sendAmount = formatUnits(leg.amountUnits, decimals);
      const result = await sendTransaction(chain, {
        walletId: leg.candidate.wallet.id,
        to,
        amount: sendAmount,
        asset
      });
      transferredUnits += leg.amountUnits;
      transfers.push({
        walletId: leg.candidate.wallet.id,
        fromAddress: leg.candidate.wallet.address,
        amount: sendAmount,
        feeReserved: formatUnits(leg.candidate.feeUnitsReserved, decimals),
        feeCurrency: leg.candidate.feeCurrency,
        txnId: result.txnId,
        txHash: result.txHash,
        status: result.status
      });
      txHashes.push(result.txHash ?? result.txnId);
    }

    const remainingUnits = requiredUnits - transferredUnits;
    return {
      chain,
      asset,
      to,
      requestedAmount: amountRaw,
      transferredAmount: formatUnits(transferredUnits, decimals),
      remainingAmount: formatUnits(remainingUnits > 0n ? remainingUnits : 0n, decimals),
      allowSplit,
      transfers,
      txHashes,
      walletsConsidered,
      walletsWithHistory,
      walletsWithLiquidity
    };
  };

  const getStatus = (chain: ChainId, txnId: string) => router.get(chain).getStatus(txnId);

  const listWallets = async (filters?: {
    chain?: ChainId;
    address?: string;
    label?: string;
    walletVirtualOwner?: string;
    limit?: number;
    offset?: number;
  }) => {
    const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
    const offset = Math.max(filters?.offset ?? 0, 0);
    const chain = filters?.chain;
    const address = filters?.address?.toLowerCase();
    const label = filters?.label?.toLowerCase();
    const owner = filters?.walletVirtualOwner?.toLowerCase();

    let wallets = await listRegisteredWallets();
    if (chain) wallets = wallets.filter((wallet) => wallet.chain === chain);
    if (address) {
      wallets = wallets.filter((wallet) => wallet.address.toLowerCase() === address);
    }
    if (label) {
      wallets = wallets.filter((wallet) => wallet.label?.toLowerCase().includes(label));
    }
    if (owner) {
      wallets = wallets.filter(
        (wallet) => wallet.walletVirtualOwner?.toLowerCase() === owner
      );
    }
    wallets = wallets.filter((wallet) => !isInstitutionalWallet(wallet));

    const toMillis = (value?: string) => {
      if (!value) return 0;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    wallets.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

    const total = wallets.length;
    const items = wallets.slice(offset, offset + limit);

    return { items, total, limit, offset };
  };

  const listInstitutional = async (filters?: {
    chain?: ChainId;
    address?: string;
    label?: string;
    limit?: number;
    offset?: number;
  }) => {
    const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
    const offset = Math.max(filters?.offset ?? 0, 0);
    const { items, total } = await listInstitutionalWallets({
      chain: filters?.chain,
      address: filters?.address,
      label: filters?.label,
      limit,
      offset
    });
    return { items, total, limit, offset };
  };

  return {
    createWallet,
    getBalance,
    reindexBalances,
    estimateFee,
    sendTransaction,
    refinanceTransfer,
    getStatus,
    createInstitutionalWallet,
    createVirtualOwnedWallets,
    listWallets,
    listInstitutionalWallets: listInstitutional,
    getChainsStatus
  };
};
