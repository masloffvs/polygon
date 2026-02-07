import xrpl from "xrpl";
import { ChainAdapter, IncomingTx } from "../common/chain-adapter";
import { ChainRpcConfig } from "../config";
import { withRpcFallback } from "../common/rpc";

export type XrpConfig = {
  rpc: ChainRpcConfig;
};

const DECIMALS = 6;

const withClient = async <T>(rpc: ChainRpcConfig, fn: (client: xrpl.Client) => Promise<T>) =>
  withRpcFallback(rpc, async (endpoint) => {
    const client = new xrpl.Client(endpoint, { connectionTimeout: rpc.timeoutMs ?? 8_000 });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.disconnect();
    }
  });

export const listIncomingTransactions = async (
  config: XrpConfig,
  address: string,
  limit = 20
): Promise<IncomingTx[]> => {
  return withClient(config.rpc, async (client) => {
    const res = await client.request({
      command: "account_tx",
      account: address,
      limit
    });
    const items: IncomingTx[] = [];
    const transactions = (res.result as { transactions?: any[] }).transactions ?? [];

    for (const entry of transactions) {
      const tx = entry.tx ?? entry;
      if (!tx || tx.TransactionType !== "Payment") continue;
      if (tx.Destination !== address) continue;
      if (typeof tx.Amount !== "string") continue;
      const status =
        entry.meta?.TransactionResult === "tesSUCCESS"
          ? "confirmed"
          : entry.meta?.TransactionResult
            ? "failed"
            : tx.validated
              ? "confirmed"
              : "pending";
      items.push({
        id: `xrp:${tx.hash}:${address}`,
        chain: "xrp",
        address,
        amount: xrpl.dropsToXrp(tx.Amount),
        asset: "XRP",
        status,
        txHash: tx.hash,
        from: tx.Account,
        timestamp: typeof tx.date === "number" ? xrpl.rippleTimeToISOTime(tx.date) : undefined
      });
    }

    return items;
  });
};

export const createXrpAdapter = (_config: XrpConfig): ChainAdapter => {
  const rpc = _config.rpc;

  return {
    chain: "xrp",
    async createWallet(label) {
      const wallet = xrpl.Wallet.generate();
      return {
        wallet: {
          id: crypto.randomUUID(),
          address: wallet.address,
          chain: "xrp",
          label
        },
        secrets: { seed: wallet.seed }
      };
    },
    async getBalance(wallet) {
      const balance = await withClient(rpc, (client) => client.getXrpBalance(wallet.address));
      return {
        amount: balance,
        decimals: DECIMALS,
        symbol: "XRP"
      };
    },
    async estimateFee() {
      const fee = await withClient(rpc, (client) => client.getFee());
      return {
        amount: fee,
        currency: "XRP",
        priority: "medium"
      };
    },
    async sendTransaction(draft) {
      const seed = draft.secrets?.seed;
      if (!seed) throw new Error("seed is required for XRP transactions");
      const wallet = xrpl.Wallet.fromSeed(seed);
      return withClient(rpc, async (client) => {
        const prepared = await client.autofill({
          TransactionType: "Payment",
          Account: wallet.address,
          Amount: xrpl.xrpToDrops(draft.amount),
          Destination: draft.to
        });
        const signed = wallet.sign(prepared);
        const res = await client.submitAndWait(signed.tx_blob);
        const meta = (res.result as any).meta;
        const success = meta?.TransactionResult === "tesSUCCESS";
        return {
          txnId: draft.clientTxnId ?? signed.hash,
          txHash: signed.hash,
          status: success ? "confirmed" : "failed",
          error: success ? undefined : meta?.TransactionResult
        };
      });
    },
    async getStatus(txnId) {
      return withClient(rpc, async (client) => {
        try {
          const res = await client.request({
            command: "tx",
            transaction: txnId,
            binary: false
          });
          const result = res.result as any;
          const meta = result.meta;
          const success = meta?.TransactionResult === "tesSUCCESS";
          const status = result.validated
            ? success
              ? "confirmed"
              : "failed"
            : "pending";
          return {
            txnId,
            txHash: result.hash ?? txnId,
            status,
            error: success ? undefined : meta?.TransactionResult
          };
        } catch (err) {
          return { txnId, status: "unknown", error: (err as Error).message };
        }
      });
    }
  };
};
