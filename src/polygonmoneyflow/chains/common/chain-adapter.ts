export type ChainId =
  | "solana"
  | "eth"
  | "base"
  | "polygon"
  | "trx"
  | "xrp"
  | "polkadot"
  | "ada"
  | "atom"
  | "link"
  | "bitcoin"
  | "lightning";

export type Wallet = {
  id: string;
  address: string;
  chain: ChainId;
  label?: string;
  createdAt?: string;
  meta?: Record<string, unknown>;
};

export type WalletSecrets = Partial<{
  privateKey: string;
  mnemonic: string;
  seed: string;
  secretKey: string;
}>;

export type Balance = {
  amount: string;
  decimals: number;
  symbol: string;
};

export type FeeQuote = {
  amount: string;
  currency: string;
  priority?: "low" | "medium" | "high";
};

export type TxDraft = {
  from: Wallet;
  to: string;
  amount: string;
  asset?: string;
  rawTx?: string;
  clientTxnId?: string;
  secrets?: WalletSecrets;
};

export type SendResult = {
  txnId: string;
  txHash?: string;
  status: TxStatus["status"];
};

export type TxStatus = {
  txnId: string;
  status: "pending" | "confirmed" | "failed" | "unknown";
  txHash?: string;
  error?: string;
};

export type IncomingTx = {
  id: string;
  chain: ChainId;
  address: string;
  amount: string;
  asset: string;
  status: TxStatus["status"];
  walletId?: string;
  walletVirtualOwner?: string;
  txHash?: string;
  from?: string;
  blockNumber?: number;
  timestamp?: string;
  meta?: Record<string, unknown>;
};

export interface ChainAdapter {
  readonly chain: ChainId;
  createWallet(label?: string): Promise<{ wallet: Wallet; secrets?: WalletSecrets }>;
  getBalance(wallet: Wallet, asset?: string): Promise<Balance>;
  estimateFee(draft: TxDraft): Promise<FeeQuote>;
  sendTransaction(draft: TxDraft): Promise<SendResult>;
  getStatus(txnId: string): Promise<TxStatus>;
}
