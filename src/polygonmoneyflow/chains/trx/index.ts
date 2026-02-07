import TronWeb from "tronweb";
import { ChainAdapter, IncomingTx } from "../common/chain-adapter";
import { ChainRpcConfig } from "../config";
import { withRpcFallback } from "../common/rpc";

export type TrxConfig = {
  rpc: ChainRpcConfig;
};

const DECIMALS = 6;

const formatSun = (sun: bigint): string => {
  const whole = sun / 1_000_000n;
  const frac = sun % 1_000_000n;
  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString();
};

const withClient = <T>(rpc: ChainRpcConfig, fn: (client: TronWeb) => Promise<T>) =>
  withRpcFallback(rpc, async (endpoint) => {
    const tronWeb = new TronWeb({ fullHost: endpoint });
    return fn(tronWeb);
  });

export const listIncomingTransactions = async (
  config: TrxConfig,
  address: string,
  limit = 20
): Promise<IncomingTx[]> => {
  return withClient(config.rpc, async (client) => {
    const txs = await client.trx.getTransactionsToAddress(address, limit, 0);
    const items: IncomingTx[] = [];

    for (const tx of txs) {
      const contract = tx.raw_data?.contract?.[0];
      const value = contract?.parameter?.value ?? {};
      const toHex = value.to_address as string | undefined;
      if (!toHex) continue;
      const to = client.address.fromHex(toHex);
      if (to !== address) continue;
      const amountSun = BigInt(value.amount ?? 0);
      if (amountSun === 0n) continue;
      const status = tx.ret?.[0]?.contractRet === "SUCCESS" ? "confirmed" : "unknown";
      const from = value.owner_address ? client.address.fromHex(value.owner_address) : undefined;
      items.push({
        id: `trx:${tx.txID}:${address}`,
        chain: "trx",
        address,
        amount: formatSun(amountSun),
        asset: "TRX",
        status,
        txHash: tx.txID,
        from,
        timestamp: tx.raw_data?.timestamp
          ? new Date(tx.raw_data.timestamp).toISOString()
          : undefined
      });
    }

    return items;
  });
};

export const createTrxAdapter = (_config: TrxConfig): ChainAdapter => {
  const rpc = _config.rpc;

  return {
    chain: "trx",
    async createWallet(label) {
      const account = TronWeb.utils.accounts.generateAccount();
      return {
        wallet: {
          id: crypto.randomUUID(),
          address: account.address.base58,
          chain: "trx",
          label,
          meta: { addressHex: account.address.hex }
        },
        secrets: { privateKey: account.privateKey }
      };
    },
    async getBalance(wallet) {
      const balance = await withClient(rpc, (client) => client.trx.getBalance(wallet.address));
      return {
        amount: (balance / 10 ** DECIMALS).toString(),
        decimals: DECIMALS,
        symbol: "TRX"
      };
    },
    async estimateFee() {
      return {
        amount: "1",
        currency: "TRX",
        priority: "medium"
      };
    },
    async sendTransaction(draft) {
      const pk = draft.secrets?.privateKey;
      if (!pk) throw new Error("privateKey is required for TRX transactions");
      return withClient(rpc, async (client) => {
        client.setPrivateKey(pk);
        const tx = await client.transactionBuilder.sendTrx(
          draft.to,
          client.toSun(draft.amount),
          draft.from.address
        );
        const signed = await client.trx.sign(tx, pk);
        const receipt = await client.trx.sendRawTransaction(signed);
        return {
          txnId: draft.clientTxnId ?? receipt.txid,
          txHash: receipt.txid,
          status: receipt.result ? "pending" : "failed",
          error: receipt.result ? undefined : "TRX send failed"
        };
      });
    },
    async getStatus(txnId) {
      return withClient(rpc, async (client) => {
        const info = await client.trx.getTransactionInfo(txnId);
        if (!info || Object.keys(info).length === 0) return { txnId, status: "pending" };
        const status =
          info.receipt?.result === "SUCCESS"
            ? "confirmed"
            : info.receipt?.result === "FAILED"
              ? "failed"
              : "unknown";
        return {
          txnId,
          txHash: txnId,
          status,
          error: status === "failed" ? JSON.stringify(info) : undefined
        };
      });
    }
  };
};
