import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction
} from "@solana/web3.js";
import { ChainAdapter, IncomingTx } from "../common/chain-adapter";
import { ChainRpcConfig } from "../config";
import { withRpcFallback } from "../common/rpc";

export type SolanaConfig = {
  rpc: ChainRpcConfig;
};

const DECIMALS = 9;

const formatLamports = (lamports: number | bigint): string => {
  const value = BigInt(lamports);
  const whole = value / 1_000_000_000n;
  const frac = value % 1_000_000_000n;
  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString();
};

const parseLamports = (amount: string): bigint => {
  const [whole, fraction = ""] = amount.split(".");
  const fractionPadded = (fraction + "000000000").slice(0, 9);
  const wholePart = BigInt(whole || "0") * 1_000_000_000n;
  const fracPart = BigInt(fractionPadded);
  return wholePart + fracPart;
};

const withConnection = <T>(rpc: ChainRpcConfig, fn: (conn: Connection) => Promise<T>) =>
  withRpcFallback(rpc, async (endpoint) => {
    const connection = new Connection(endpoint, { commitment: "confirmed" });
    return fn(connection);
  });

export const listIncomingTransactions = async (
  config: SolanaConfig,
  address: string,
  limit = 20
): Promise<IncomingTx[]> => {
  return withConnection(config.rpc, async (conn) => {
    const pubkey = new PublicKey(address);
    const signatures = await conn.getSignaturesForAddress(pubkey, { limit });
    const items: IncomingTx[] = [];

    for (const sig of signatures) {
      const tx = await conn.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0
      });
      if (!tx) continue;
      const instructions = tx.transaction.message.instructions ?? [];
      let totalLamports = 0n;
      let from: string | undefined;
      for (const instruction of instructions) {
        if ("parsed" in instruction && instruction.program === "system") {
          const parsed = instruction.parsed as {
            type?: string;
            info?: { destination?: string; source?: string; lamports?: number };
          };
          if (parsed.type !== "transfer") continue;
          const destination = parsed.info?.destination;
          if (destination !== address) continue;
          totalLamports += BigInt(parsed.info?.lamports ?? 0);
          if (!from && parsed.info?.source) from = parsed.info.source;
        }
      }
      if (totalLamports === 0n) continue;
      const status = tx.meta?.err ? "failed" : "confirmed";
      items.push({
        id: `solana:${sig.signature}:${address}`,
        chain: "solana",
        address,
        amount: formatLamports(totalLamports),
        asset: "SOL",
        status,
        txHash: sig.signature,
        from,
        timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined
      });
    }

    return items;
  });
};

export const createSolanaAdapter = (_config: SolanaConfig): ChainAdapter => {
  const rpc = _config.rpc;

  return {
    chain: "solana",
    async createWallet(label) {
      const keypair = Keypair.generate();
      const secretKey = Buffer.from(keypair.secretKey).toString("base64");
      return {
        wallet: {
          id: crypto.randomUUID(),
          address: keypair.publicKey.toBase58(),
          chain: "solana",
          label
        },
        secrets: { secretKey }
      };
    },
    async getBalance(wallet) {
      const lamports = await withConnection(rpc, (conn) =>
        conn.getBalance(new PublicKey(wallet.address))
      );
      return {
        amount: formatLamports(lamports),
        decimals: DECIMALS,
        symbol: "SOL"
      };
    },
    async estimateFee() {
      const lamportsPerSignature = await withConnection(rpc, async (conn) => {
        const { feeCalculator } = await conn.getRecentBlockhash();
        return feeCalculator.lamportsPerSignature;
      });
      return {
        amount: formatLamports(lamportsPerSignature),
        currency: "SOL",
        priority: "medium"
      };
    },
    async sendTransaction(draft) {
      const secret = draft.secrets?.secretKey;
      if (!secret) throw new Error("secretKey is required to sign Solana transactions");
      const keypair = Keypair.fromSecretKey(Buffer.from(secret, "base64"));
      return withConnection(rpc, async (conn) => {
        const lamports = parseLamports(draft.amount);
        if (lamports <= 0n) {
          throw new Error("amount must be greater than 0");
        }
        const toPubkey = new PublicKey(draft.to);
        const [destinationAccount, rentExemptLamports] = await Promise.all([
          conn.getAccountInfo(toPubkey),
          conn.getMinimumBalanceForRentExemption(0),
        ]);
        if (!destinationAccount && lamports < BigInt(rentExemptLamports)) {
          throw new Error(
            `Destination account ${draft.to} is not initialized. Minimum first transfer is ${formatLamports(
              rentExemptLamports,
            )} SOL to satisfy rent-exempt balance. Requested ${draft.amount} SOL.`,
          );
        }

        const tx = new Transaction();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: toPubkey,
            lamports: lamports
          })
        );
        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;
        tx.feePayer = keypair.publicKey;
        const signature = await conn.sendTransaction(tx, [keypair]);
        return {
          txnId: draft.clientTxnId ?? signature,
          txHash: signature,
          status: "pending"
        };
      });
    },
    async getStatus(txnId) {
      return withConnection(rpc, async (conn) => {
        const statusInfo = await conn.getSignatureStatus(txnId, { searchTransactionHistory: true });
        const status = statusInfo?.value;
        if (!status) return { txnId, status: "pending" };
        if (status.err) return { txnId, status: "failed", error: JSON.stringify(status.err) };
        if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
          return { txnId, txHash: txnId, status: "confirmed" };
        }
        return { txnId, status: "pending" };
      });
    }
  };
};
