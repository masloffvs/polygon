import { ChainAdapter, TxStatus } from "../common/chain-adapter";
import { createPlaceholderAdapter } from "../common/placeholder";
import { withRpcFallback } from "../common/rpc";
import { ChainRpcConfig } from "../config";

export type LightningConfig = {
  rpc: ChainRpcConfig;
};

const DECIMALS = 8;
const SATS_PER_BTC = 100_000_000n;

const toUrl = (base: string, path: string): string =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const formatSats = (value: bigint): string => {
  const whole = value / SATS_PER_BTC;
  const frac = value % SATS_PER_BTC;
  const fracStr = frac.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fracStr.length ? `${whole}.${fracStr}` : whole.toString();
};

const parseSats = (value: string): bigint => {
  const [whole, fraction = ""] = value.trim().split(".");
  const fractionPadded = (fraction + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(whole || "0") * SATS_PER_BTC + BigInt(fractionPadded || "0");
};

const hasLndCredentials = () => Boolean(process.env.LIGHTNING_MACAROON?.trim());

const getLndHeaders = (): Record<string, string> => {
  const macaroon = process.env.LIGHTNING_MACAROON?.trim();
  if (!macaroon) throw new Error("LIGHTNING_MACAROON is required for real Lightning operations");
  return {
    "content-type": "application/json",
    "Grpc-Metadata-macaroon": macaroon
  };
};

export const createLightningAdapter = (_config: LightningConfig): ChainAdapter => {
  if (!hasLndCredentials()) {
    return createPlaceholderAdapter("lightning", {
      symbol: "BTC",
      decimals: DECIMALS,
      feeAmount: "0.000001",
      feePriority: "high",
      addressPrefix: "lnbc1",
      meta: {
        placeholderReason:
          "Set LIGHTNING_MACAROON to enable real Lightning logic via LND REST API.",
        rpcPrimary: _config.rpc.primary
      }
    });
  }

  const rpc = _config.rpc;

  const withLnd = async <T>(
    fn: (endpoint: string, headers: Record<string, string>) => Promise<T>
  ): Promise<T> =>
    withRpcFallback(rpc, async (endpoint) => {
      const headers = getLndHeaders();
      return fn(endpoint, headers);
    });

  return {
    chain: "lightning",
    async createWallet(label) {
      return withLnd(async (endpoint, headers) => {
        const res = await fetch(toUrl(endpoint, "/v1/getinfo"), { headers });
        if (!res.ok) throw new Error(`LND getinfo failed (${res.status}): ${await res.text()}`);
        const info = (await res.json()) as { identity_pubkey?: string; alias?: string };
        if (!info.identity_pubkey) {
          throw new Error("LND getinfo response missing identity_pubkey");
        }
        return {
          wallet: {
            id: crypto.randomUUID(),
            address: info.identity_pubkey,
            chain: "lightning",
            label,
            meta: {
              lndAlias: info.alias,
              lndBacked: true
            }
          }
        };
      });
    },
    async getBalance() {
      return withLnd(async (endpoint, headers) => {
        const res = await fetch(toUrl(endpoint, "/v1/balance/channels"), { headers });
        if (!res.ok) {
          throw new Error(`LND channel balance failed (${res.status}): ${await res.text()}`);
        }
        const data = (await res.json()) as { balance?: string };
        const sats = BigInt(data.balance ?? "0");
        return {
          amount: formatSats(sats),
          decimals: DECIMALS,
          symbol: "BTC"
        };
      });
    },
    async estimateFee() {
      return {
        amount: "0.000001",
        currency: "BTC",
        priority: "high"
      };
    },
    async sendTransaction(draft) {
      if (!draft.to?.trim()) {
        throw new Error("Lightning send requires `to` as BOLT11 invoice");
      }
      return withLnd(async (endpoint, headers) => {
        const sats = parseSats(draft.amount);
        const payload: Record<string, string> = { payment_request: draft.to.trim() };
        if (sats > 0n) payload.amt = sats.toString();

        const res = await fetch(toUrl(endpoint, "/v1/channels/transactions"), {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          throw new Error(`Lightning payment failed (${res.status}): ${await res.text()}`);
        }
        const payment = (await res.json()) as { payment_hash?: string; payment_error?: string };
        if (payment.payment_error) {
          return {
            txnId: draft.clientTxnId ?? crypto.randomUUID(),
            status: "failed",
            error: payment.payment_error
          };
        }
        const hash = payment.payment_hash;
        if (!hash) throw new Error("Lightning payment succeeded but no payment_hash returned");
        return {
          txnId: draft.clientTxnId ?? hash,
          txHash: hash,
          status: "confirmed"
        };
      });
    },
    async getStatus(txnId): Promise<TxStatus> {
      return withLnd(async (endpoint, headers) => {
        const res = await fetch(toUrl(endpoint, `/v1/payments/${txnId}`), { headers });
        if (res.status === 404) return { txnId, txHash: txnId, status: "pending" };
        if (!res.ok) {
          throw new Error(`Lightning status failed (${res.status}): ${await res.text()}`);
        }
        const data = (await res.json()) as { status?: string; failure_reason?: string };
        const statusRaw = (data.status ?? "").toUpperCase();
        const status: TxStatus["status"] =
          statusRaw === "SUCCEEDED"
            ? "confirmed"
            : statusRaw === "FAILED"
              ? "failed"
              : "pending";
        return {
          txnId,
          txHash: txnId,
          status,
          error: status === "failed" ? data.failure_reason : undefined
        };
      });
    }
  };
};
