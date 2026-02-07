import { ChainId, TxDraft, Wallet, WalletSecrets } from "../../chains/common/chain-adapter";
import { createChainRouter } from "../router";
import { AppConfig } from "../infra/config";
import { BadRequestError, NotFoundError } from "../utils/errors";
import {
  findByAddress,
  getWallet,
  listInstitutionalWallets,
  saveWallet
} from "../infra/keystore";
import {
  listWallets as listRegisteredWallets,
  listWalletsByOwner,
  registerWallet
} from "../infra/wallet-registry";

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
      const stored = await getWallet(opts.walletId);
      if (!stored) throw new NotFoundError(`Wallet ${opts.walletId} not found`);
      return stored;
    }
    if (opts.address) {
      const stored = await findByAddress(chain, opts.address);
      if (stored) return stored;
      if (opts.secrets) {
        return { id: opts.address, address: opts.address, chain, secrets: opts.secrets };
      }
      return { id: opts.address, address: opts.address, chain };
    }
    throw new BadRequestError("walletId or address is required");
  };

  const getBalance = async (chain: ChainId, walletIdOrAddress: string, asset?: string) => {
    const wallet = await resolveWallet(chain, {
      walletId: walletIdOrAddress,
      address: walletIdOrAddress
    });
    return router.get(chain).getBalance(wallet, asset);
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
    return router.get(chain).sendTransaction(draft);
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
    estimateFee,
    sendTransaction,
    getStatus,
    createInstitutionalWallet,
    createVirtualOwnedWallets,
    listWallets,
    listInstitutionalWallets: listInstitutional,
    getChainsStatus
  };
};
