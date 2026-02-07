import {
  Balance,
  ChainAdapter,
  ChainId,
  FeeQuote,
  SendResult,
  TxDraft,
  TxStatus,
  Wallet,
  WalletSecrets
} from "./chain-adapter";

const notImplemented = (chain: ChainId, method: string) =>
  `${method} not implemented for ${chain}. Replace placeholder with real logic.`;

type PlaceholderAdapterOptions = {
  symbol?: string;
  decimals?: number;
  feeAmount?: string;
  feePriority?: "low" | "medium" | "high";
  addressPrefix?: string;
  meta?: Record<string, unknown>;
};

const randomHex = (bytes = 8) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const createPlaceholderAdapter = (
  chain: ChainId,
  options: PlaceholderAdapterOptions = {}
): ChainAdapter => {
  const symbol = options.symbol ?? chain.toUpperCase();
  const decimals = options.decimals ?? 9;
  const feeAmount = options.feeAmount ?? "0.0001";
  const feePriority = options.feePriority ?? "medium";

  return {
    chain,
    async createWallet(label?: string): Promise<{ wallet: Wallet; secrets?: WalletSecrets }> {
      const suffix = randomHex(6);
      const address = options.addressPrefix
        ? `${options.addressPrefix}${suffix}`
        : `demo-${chain}-${suffix}`;
      return {
        wallet: {
          id: crypto.randomUUID(),
          address,
          chain,
          label,
          meta: { placeholder: true, ...options.meta }
        }
      };
    },
    async getBalance(wallet: Wallet): Promise<Balance> {
      return {
        amount: "0",
        decimals,
        symbol
      };
    },
    async estimateFee(): Promise<FeeQuote> {
      return {
        amount: feeAmount,
        currency: symbol,
        priority: feePriority
      };
    },
    async sendTransaction(draft: TxDraft): Promise<SendResult> {
      return {
        txnId: draft.clientTxnId ?? crypto.randomUUID(),
        txHash: `demo-${chain}-tx-${Date.now()}`,
        status: "pending"
      };
    },
    async getStatus(txnId: string): Promise<TxStatus> {
      return {
        txnId,
        status: "unknown",
        error: notImplemented(chain, "getStatus")
      };
    }
  };
};
