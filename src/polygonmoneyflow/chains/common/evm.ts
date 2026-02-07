import { Address, Hex, createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ChainAdapter, IncomingTx, TxDraft, TxStatus, Wallet, WalletSecrets } from "./chain-adapter";
import { ChainRpcConfig } from "../config";

type EvmAdapterOptions = {
  chainName: string;
  chainId: number;
  symbol: string;
  rpc: ChainRpcConfig;
  keyPrefix: "eth" | "base" | "polygon";
};

const DECIMALS = 18;

const makeClientFactory = (rpc: ChainRpcConfig, chainId: number, chainName: string, symbol: string) => {
  const endpoints = [rpc.primary, ...(rpc.fallbacks ?? [])];
  const timeout = rpc.timeoutMs ?? 8_000;

  return (endpoint: string) => {
    const chain = {
      id: chainId,
      name: chainName,
      nativeCurrency: { name: symbol, symbol, decimals: DECIMALS },
      rpcUrls: { default: { http: [endpoint] } }
    };
    const transport = http(endpoint, { timeout });
    return {
      chain,
      transport,
      publicClient: createPublicClient({ chain, transport })
    };
  };
};

const createClientHelpers = (
  rpc: ChainRpcConfig,
  chainId: number,
  chainName: string,
  symbol: string
) => {
  const makeClient = makeClientFactory(rpc, chainId, chainName, symbol);
  const endpoints = [rpc.primary, ...(rpc.fallbacks ?? [])];

  const withClient = async <T>(fn: (ctx: ReturnType<typeof makeClient>) => Promise<T>): Promise<T> => {
    let lastError: unknown;
    for (const endpoint of endpoints) {
      try {
        return await fn(makeClient(endpoint));
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error("All EVM RPC endpoints failed");
  };

  return { makeClient, withClient };
};

export type EvmIncomingScanOptions = {
  chain: "eth" | "base" | "polygon";
  chainId: number;
  chainName: string;
  symbol: string;
  rpc: ChainRpcConfig;
  addresses: string[];
  cursor?: number;
  maxBlocks?: number;
  lookback?: number;
  walletIdByAddress?: Map<string, string>;
};

export type EvmIncomingScanResult = {
  items: IncomingTx[];
  lastBlock?: number;
  latestBlock?: number;
};

export const scanEvmIncoming = async (opts: EvmIncomingScanOptions): Promise<EvmIncomingScanResult> => {
  const {
    chain,
    chainId,
    chainName,
    symbol,
    rpc,
    addresses,
    cursor,
    maxBlocks = 20,
    lookback = 50,
    walletIdByAddress
  } = opts;
  if (!addresses.length) return { items: [] };
  const normalized = new Set(addresses.map((address) => address.toLowerCase()));
  const { withClient } = createClientHelpers(rpc, chainId, chainName, symbol);

  return withClient(async (ctx) => {
    const latestBigInt = await ctx.publicClient.getBlockNumber();
    const latest = Number(latestBigInt);
    const start = Math.max(0, cursor !== undefined ? cursor + 1 : latest - lookback);
    if (start > latest) {
      return { items: [], lastBlock: latest, latestBlock: latest };
    }
    const end = Math.min(latest, start + Math.max(1, maxBlocks) - 1);
    const items: IncomingTx[] = [];

    for (let blockNumber = start; blockNumber <= end; blockNumber += 1) {
      const block = await ctx.publicClient.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: true
      });
      const timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
      for (const tx of block.transactions) {
        const to = tx.to?.toLowerCase();
        if (!to || !normalized.has(to)) continue;
        if (tx.value === 0n) continue;
        const walletId = walletIdByAddress?.get(to);
        items.push({
          id: `${chain}:${tx.hash}:${to}`,
          chain,
          address: tx.to as string,
          amount: formatEther(tx.value),
          asset: symbol,
          status: "confirmed",
          walletId,
          txHash: tx.hash,
          from: tx.from,
          blockNumber,
          timestamp
        });
      }
    }

    return { items, lastBlock: end, latestBlock: latest };
  });
};

export const createEvmAdapter = (opts: EvmAdapterOptions): ChainAdapter => {
  const { chainName, chainId, symbol, rpc, keyPrefix } = opts;
  const { withClient } = createClientHelpers(rpc, chainId, chainName, symbol);

  const ensurePrivateKey = (secrets?: WalletSecrets) => {
    const pk = secrets?.privateKey;
    if (!pk) throw new Error("Private key is required for this operation");
    return pk as Hex;
  };

  return {
    chain: keyPrefix,
    async createWallet(label?: string): Promise<{ wallet: Wallet; secrets?: WalletSecrets }> {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      return {
        wallet: {
          id: crypto.randomUUID(),
          address: account.address,
          chain: keyPrefix,
          label,
          meta: { publicKey: account.publicKey }
        },
        secrets: { privateKey }
      };
    },
    async getBalance(wallet: Wallet) {
      const balance = await withClient((ctx) =>
        ctx.publicClient.getBalance({ address: wallet.address as Address })
      );
      return {
        amount: formatEther(balance),
        decimals: DECIMALS,
        symbol
      };
    },
    async estimateFee(draft: TxDraft) {
      const { to, amount } = draft;
      const gasPrice = await withClient((ctx) => ctx.publicClient.getGasPrice());
      const estimatedGas = 21_000n;
      const fee = gasPrice * estimatedGas;
      return {
        amount: formatEther(fee),
        currency: symbol,
        priority: "medium"
      };
    },
    async sendTransaction(draft: TxDraft) {
      const pk = ensurePrivateKey(draft.secrets);
      return withClient(async (ctx) => {
        const account = privateKeyToAccount(pk);
        const walletClient = createWalletClient({
          account,
          chain: ctx.chain,
          transport: ctx.transport
        });
        const hash = await walletClient.sendTransaction({
          account,
          to: draft.to as Address,
          value: parseEther(draft.amount)
        });
        return {
          txnId: draft.clientTxnId ?? hash,
          txHash: hash,
          status: "pending"
        };
      });
    },
    async getStatus(txnId: string): Promise<TxStatus> {
      return withClient(async (ctx) => {
        try {
          const receipt = await ctx.publicClient.getTransactionReceipt({ hash: txnId as Hex });
          const status =
            receipt.status === "success"
              ? "confirmed"
              : receipt.status === "reverted"
                ? "failed"
                : "pending";
          return { txnId, txHash: receipt.transactionHash, status };
        } catch (err) {
          return { txnId, status: "unknown", error: (err as Error).message };
        }
      });
    }
  };
};
