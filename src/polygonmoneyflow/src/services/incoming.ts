import { ChainId, IncomingTx, Wallet } from "../../chains/common/chain-adapter";
import { listIncomingForAddress } from "../infra/txstore";
import {
  findWalletByAddress,
  getWallet,
  listWallets,
  listWalletsByOwner
} from "../infra/wallet-registry";
import { BadRequestError, NotFoundError } from "../utils/errors";

type IncomingQuery = {
  chain?: ChainId;
  walletId?: string;
  address?: string;
  limit?: number;
};

const resolveTargets = async ({
  chain,
  walletId,
  address
}: IncomingQuery): Promise<Wallet[]> => {
  if (walletId) {
    const wallet = await getWallet(walletId);
    if (!wallet) throw new NotFoundError(`Wallet ${walletId} not found`);
    return [wallet];
  }

  if (address && chain) {
    const wallet = await findWalletByAddress(chain, address);
    if (!wallet) throw new NotFoundError(`Wallet ${address} not found`);
    return [wallet];
  }

  if (address && !chain) {
    const wallets = await listWallets();
    const matches = wallets.filter(
      (wallet) => wallet.address.toLowerCase() === address.toLowerCase()
    );
    if (matches.length === 0) throw new NotFoundError(`Wallet for address ${address} not found`);
    if (matches.length > 1) {
      throw new BadRequestError("Multiple wallets share this address, specify chain");
    }
    return matches;
  }

  const wallets = await listWallets();
  return chain ? wallets.filter((wallet) => wallet.chain === chain) : wallets;
};

const toMillis = (tx: IncomingTx) => {
  if (tx.timestamp) {
    const parsed = Date.parse(tx.timestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

export const createIncomingService = () => {
  const listIncoming = async (query: IncomingQuery): Promise<IncomingTx[]> => {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const targets = await resolveTargets(query);
    if (!targets.length) return [];

    const items: IncomingTx[] = [];
    for (const wallet of targets) {
      const txs = await listIncomingForAddress(wallet.chain, wallet.address, limit);
      for (const tx of txs) {
        if (!tx.walletId && wallet.id) tx.walletId = wallet.id;
        if (!tx.walletVirtualOwner && wallet.walletVirtualOwner) {
          tx.walletVirtualOwner = wallet.walletVirtualOwner;
        }
        items.push(tx);
      }
    }

    return items.sort((a, b) => toMillis(b) - toMillis(a)).slice(0, limit);
  };

  const listIncomingByOwner = async (owner: string, limit?: number): Promise<IncomingTx[]> => {
    const normalizedOwner = owner.trim().toLowerCase();
    if (!normalizedOwner) throw new BadRequestError("owner is required");
    const targetLimit = Math.min(Math.max(limit ?? 50, 1), 200);
    const wallets = await listWalletsByOwner(normalizedOwner);
    if (!wallets.length) throw new NotFoundError(`Owner ${owner} not found`);

    const items: IncomingTx[] = [];
    for (const wallet of wallets) {
      const txs = await listIncomingForAddress(wallet.chain, wallet.address, targetLimit);
      for (const tx of txs) {
        if (!tx.walletId && wallet.id) tx.walletId = wallet.id;
        if (!tx.walletVirtualOwner && wallet.walletVirtualOwner) {
          tx.walletVirtualOwner = wallet.walletVirtualOwner;
        }
        items.push(tx);
      }
    }

    return items.sort((a, b) => toMillis(b) - toMillis(a)).slice(0, targetLimit);
  };

  return { listIncoming, listIncomingByOwner };
};
