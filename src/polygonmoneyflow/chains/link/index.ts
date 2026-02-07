import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseAbiItem,
  parseUnits
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  ChainAdapter,
  IncomingTx,
  TxStatus,
  WalletSecrets
} from "../common/chain-adapter";
import { withRpcFallback } from "../common/rpc";
import { ChainRpcConfig } from "../config";

export type LinkConfig = {
  rpc: ChainRpcConfig;
  chainId: number;
  tokenAddress?: string;
};

type LinkRuntime = {
  rpc: ChainRpcConfig;
  chainId: number;
  tokenAddress: Address;
};

const DEFAULT_LINK_BY_CHAIN: Record<number, Address> = {
  1: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  137: "0x53E0bca35eC356BD5ddDFebBD1Fc0fD03FaBad39",
  42161: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4"
};

const FALLBACK_DECIMALS = 18;
const FALLBACK_SYMBOL = "LINK";
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }]
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "ok", type: "bool" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "decimals", type: "uint8" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "symbol", type: "string" }]
  }
] as const;

type TokenMeta = {
  decimals: number;
  symbol: string;
};

const toChain = (chainId: number, endpoint: string) => ({
  id: chainId,
  name: chainId === 1 ? "Ethereum" : `LINK-${chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [endpoint] } }
});

const normalizeTokenAddress = (value: unknown, chainId: number): Address => {
  const fromConfig = typeof value === "string" ? value.trim() : undefined;
  if (fromConfig && /^0x[a-fA-F0-9]{40}$/.test(fromConfig)) return fromConfig as Address;
  const known = DEFAULT_LINK_BY_CHAIN[chainId];
  if (known) return known;
  throw new Error(
    `LINK token address is not configured for chainId=${chainId}. Set LINK_TOKEN_ADDRESS.`
  );
};

const resolveRuntime = (_config: LinkConfig): LinkRuntime => ({
  rpc: _config.rpc,
  chainId: _config.chainId,
  tokenAddress: normalizeTokenAddress(
    _config.tokenAddress ?? process.env.LINK_TOKEN_ADDRESS,
    _config.chainId
  )
});

const createClientHelpers = (runtime: LinkRuntime) => {
  let cachedMeta: TokenMeta | undefined;

  const withClient = async <T>(
    fn: (ctx: {
      chain: ReturnType<typeof toChain>;
      transport: ReturnType<typeof http>;
      publicClient: ReturnType<typeof createPublicClient>;
    }) => Promise<T>
  ): Promise<T> =>
    withRpcFallback(runtime.rpc, async (endpoint) => {
      const chain = toChain(runtime.chainId, endpoint);
      const transport = http(endpoint, { timeout: runtime.rpc.timeoutMs ?? 8_000 });
      const publicClient = createPublicClient({ chain, transport });
      return fn({ chain, transport, publicClient });
    });

  const getTokenMeta = async (): Promise<TokenMeta> => {
    if (cachedMeta) return cachedMeta;
    return withClient(async ({ publicClient }) => {
      try {
        const [decimals, symbol] = await Promise.all([
          publicClient.readContract({
            address: runtime.tokenAddress,
            abi: erc20Abi,
            functionName: "decimals"
          }),
          publicClient.readContract({
            address: runtime.tokenAddress,
            abi: erc20Abi,
            functionName: "symbol"
          })
        ]);
        cachedMeta = { decimals: Number(decimals), symbol: String(symbol) };
      } catch {
        cachedMeta = { decimals: FALLBACK_DECIMALS, symbol: FALLBACK_SYMBOL };
      }
      return cachedMeta;
    });
  };

  return { withClient, getTokenMeta };
};

const ensurePrivateKey = (secrets?: WalletSecrets): Hex => {
  const privateKey = secrets?.privateKey;
  if (!privateKey) throw new Error("privateKey is required for LINK transfers");
  return privateKey as Hex;
};

const assertAsset = (asset?: string) => {
  if (!asset) return;
  if (asset.trim().toUpperCase() === "LINK") return;
  throw new Error(`LINK adapter supports LINK asset only, got: ${asset}`);
};

export const listIncomingTransactions = async (
  config: LinkConfig,
  address: string,
  limit = 20
): Promise<IncomingTx[]> => {
  const runtime = resolveRuntime(config);
  const { withClient, getTokenMeta } = createClientHelpers(runtime);
  const lookback = Math.max(100, Number(process.env.MONITOR_LINK_LOOKBACK ?? "2000"));

  return withClient(async ({ publicClient }) => {
    const tokenMeta = await getTokenMeta();
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = latestBlock > BigInt(lookback) ? latestBlock - BigInt(lookback) : 0n;
    const logs = await publicClient.getLogs({
      address: runtime.tokenAddress,
      event: transferEvent,
      args: { to: address as Address },
      fromBlock,
      toBlock: latestBlock
    });

    const timestampByBlock = new Map<string, string>();
    const items: IncomingTx[] = [];

    for (const log of [...logs].reverse()) {
      if (!log.transactionHash) continue;
      const args = log.args as { from?: Address; to?: Address; value?: bigint };
      const value = args.value ?? 0n;
      if (value <= 0n) continue;

      let timestamp: string | undefined;
      if (log.blockNumber !== null && log.blockNumber !== undefined) {
        const key = log.blockNumber.toString();
        if (!timestampByBlock.has(key)) {
          try {
            const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
            timestampByBlock.set(
              key,
              new Date(Number(block.timestamp) * 1000).toISOString()
            );
          } catch {
            timestampByBlock.set(key, "");
          }
        }
        const candidate = timestampByBlock.get(key);
        timestamp = candidate || undefined;
      }

      items.push({
        id: `link:${log.transactionHash}:${address}:${log.logIndex}`,
        chain: "link",
        address,
        amount: formatUnits(value, tokenMeta.decimals),
        asset: tokenMeta.symbol,
        status: "confirmed",
        txHash: log.transactionHash,
        from: args.from,
        blockNumber:
          log.blockNumber !== null && log.blockNumber !== undefined
            ? Number(log.blockNumber)
            : undefined,
        timestamp
      });

      if (items.length >= limit) break;
    }

    return items;
  });
};

export const createLinkAdapter = (_config: LinkConfig): ChainAdapter => {
  const runtime = resolveRuntime(_config);
  const { withClient, getTokenMeta } = createClientHelpers(runtime);

  return {
    chain: "link",
    async createWallet(label) {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      return {
        wallet: {
          id: crypto.randomUUID(),
          address: account.address,
          chain: "link",
          label,
          meta: {
            publicKey: account.publicKey,
            tokenAddress: runtime.tokenAddress,
            chainId: runtime.chainId
          }
        },
        secrets: { privateKey }
      };
    },
    async getBalance(wallet) {
      const tokenMeta = await getTokenMeta();
      const value = await withClient((ctx) =>
        ctx.publicClient.readContract({
          address: runtime.tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet.address as Address]
        })
      );
      return {
        amount: formatUnits(value, tokenMeta.decimals),
        decimals: tokenMeta.decimals,
        symbol: tokenMeta.symbol
      };
    },
    async estimateFee(draft) {
      assertAsset(draft.asset);
      const tokenMeta = await getTokenMeta();
      const amount = parseUnits(draft.amount, tokenMeta.decimals);
      return withClient(async ({ publicClient }) => {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [draft.to as Address, amount]
        });
        const gasPrice = await publicClient.getGasPrice();
        const gasLimit = await publicClient
          .estimateGas({
            account: draft.from.address as Address,
            to: runtime.tokenAddress,
            data,
            value: 0n
          })
          .catch(() => 80_000n);
        return {
          amount: formatUnits(gasPrice * gasLimit, 18),
          currency: "ETH",
          priority: "medium"
        };
      });
    },
    async sendTransaction(draft) {
      assertAsset(draft.asset);
      const tokenMeta = await getTokenMeta();
      const pk = ensurePrivateKey(draft.secrets);
      const amount = parseUnits(draft.amount, tokenMeta.decimals);

      return withClient(async ({ chain, transport }) => {
        const account = privateKeyToAccount(pk);
        const walletClient = createWalletClient({
          account,
          chain,
          transport
        });
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [draft.to as Address, amount]
        });
        const txHash = await walletClient.sendTransaction({
          account,
          to: runtime.tokenAddress,
          data,
          value: 0n
        });
        return {
          txnId: draft.clientTxnId ?? txHash,
          txHash,
          status: "pending"
        };
      });
    },
    async getStatus(txnId): Promise<TxStatus> {
      return withClient(async ({ publicClient }) => {
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: txnId as Hex });
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
