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

export const createWalletService = (config: AppConfig) => {
  const router = createChainRouter(config.chains);
  const institutionalChains = new Set(config.institutional.chains);

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
    listInstitutionalWallets: listInstitutional
  };
};
