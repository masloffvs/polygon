/**
 * Balance Service
 * Handles balance reporting and aggregation
 */

import { logger } from "../logger";
import type { AppConfig } from "../config";
import { getWalletApi, type IncomingTx } from "../wallet-api";

export interface ReportBalance {
  symbol: string;
  amount: number;
  usd_value: number;
}

const CHAIN_NATIVE_SYMBOLS: Record<string, string> = {
  solana: "SOL",
  eth: "ETH",
  base: "ETH",
  polygon: "MATIC",
  trx: "TRX",
  xrp: "XRP",
  polkadot: "DOT",
  bitcoin: "BTC",
  atom: "ATOM",
  ada: "ADA",
  link: "LINK",
  doge: "DOGE",
  ltc: "LTC",
};

const STABLE_USD_SYMBOLS = new Set(["USD", "USDT", "USDC", "BUSD", "TUSD", "DAI"]);

export class BalanceService {
  private usdPriceCache = new Map<string, { price: number; expiresAt: number }>();
  private fallbackBalanceCache: {
    balances: ReportBalance[];
    expiresAt: number;
  } | null = null;

  constructor(private config: AppConfig) {}

  /**
   * Collect all balances for reporting
   */
  async collectBalances(): Promise<ReportBalance[]> {
    if (this.config.balanceTargets.length === 0) {
      return this.collectBalancesFromIncomingCacheCached();
    }

    const walletApi = getWalletApi();
    const aggregated = new Map<string, { amount: number; usdValue: number }>();

    for (const target of this.config.balanceTargets) {
      try {
        const balance = await walletApi.getBalance(
          target.chain,
          target.idOrAddress,
          target.asset
        );

        const amount = Number.parseFloat(balance.amount);
        if (!Number.isFinite(amount)) {
          logger.warn(
            { target, rawAmount: balance.amount },
            "Skipping invalid balance amount"
          );
          continue;
        }

        const symbol = (target.symbol || balance.symbol || target.chain).toUpperCase();
        const usdPrice = await this.resolveUsdPrice(symbol);
        const usdValue = usdPrice !== null ? amount * usdPrice : 0;

        const prev = aggregated.get(symbol) ?? { amount: 0, usdValue: 0 };
        aggregated.set(symbol, {
          amount: prev.amount + amount,
          usdValue: prev.usdValue + usdValue,
        });
      } catch (error) {
        logger.warn(
          {
            chain: target.chain,
            idOrAddress: target.idOrAddress,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to fetch balance target"
        );
      }
    }

    return Array.from(aggregated.entries())
      .map(([symbol, value]) => ({
        symbol,
        amount: Number(value.amount.toFixed(8)),
        usd_value: Number(value.usdValue.toFixed(2)),
      }))
      .sort((a, b) => b.usd_value - a.usd_value);
  }

  private async collectBalancesFromIncomingCacheCached(): Promise<ReportBalance[]> {
    const now = Date.now();
    if (this.fallbackBalanceCache && this.fallbackBalanceCache.expiresAt > now) {
      return this.fallbackBalanceCache.balances;
    }

    try {
      const balances = await this.collectBalancesFromIncomingCache();
      this.fallbackBalanceCache = {
        balances,
        expiresAt: now + this.config.balanceFallbackCacheTtlMs,
      };
      return balances;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Incoming-cache balance fallback failed"
      );
      return [];
    }
  }

  private async collectBalancesFromIncomingCache(): Promise<ReportBalance[]> {
    const walletApi = getWalletApi();
    const owners = new Set<string>();
    const walletsWithoutOwner: string[] = [];

    let offset = 0;
    let loadedWallets = 0;
    while (loadedWallets < this.config.balanceFallbackWalletMax) {
      const page = await walletApi.listWallets({
        limit: this.config.balanceFallbackWalletPageLimit,
        offset,
      });
      if (page.items.length === 0) break;

      for (const wallet of page.items) {
        loadedWallets += 1;
        if (wallet.walletVirtualOwner) {
          owners.add(wallet.walletVirtualOwner);
        } else {
          walletsWithoutOwner.push(wallet.id);
        }
        if (loadedWallets >= this.config.balanceFallbackWalletMax) break;
      }

      offset += page.items.length;
      if (offset >= page.total) break;
    }

    if (owners.size === 0 && walletsWithoutOwner.length === 0) {
      logger.debug("No wallets found for incoming-cache balance fallback");
      return [];
    }

    const aggregated = new Map<string, number>();

    for (const owner of owners) {
      try {
        const txs = await walletApi.getIncomingByOwner(
          owner,
          this.config.balanceFallbackIncomingLimit
        );
        this.accumulateIncomingBalances(aggregated, txs);
      } catch (error) {
        logger.warn(
          {
            owner,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to read incoming transactions for owner"
        );
      }
    }

    for (const walletId of walletsWithoutOwner) {
      try {
        const txs = await walletApi.getIncoming({
          walletId,
          limit: this.config.balanceFallbackIncomingLimit,
        });
        this.accumulateIncomingBalances(aggregated, txs);
      } catch (error) {
        logger.warn(
          {
            walletId,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to read incoming transactions for wallet"
        );
      }
    }

    const balances: ReportBalance[] = [];
    for (const [symbol, amount] of aggregated.entries()) {
      const usdPrice = await this.resolveUsdPrice(symbol);
      balances.push({
        symbol,
        amount: Number(amount.toFixed(8)),
        usd_value: Number((usdPrice !== null ? amount * usdPrice : 0).toFixed(2)),
      });
    }

    const result = balances.sort((a, b) => b.usd_value - a.usd_value);
    logger.info(
      {
        walletsScanned: loadedWallets,
        ownersScanned: owners.size,
        assets: result.length,
      },
      "Built balance report from incoming transaction cache"
    );
    return result;
  }

  private accumulateIncomingBalances(
    aggregated: Map<string, number>,
    txs: IncomingTx[]
  ): void {
    for (const tx of txs) {
      if (tx.status !== "confirmed") continue;

      const amount = Number.parseFloat(tx.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const symbol = this.resolveIncomingSymbol(tx);
      aggregated.set(symbol, (aggregated.get(symbol) ?? 0) + amount);
    }
  }

  private resolveIncomingSymbol(tx: IncomingTx): string {
    const rawAsset = typeof tx.asset === "string" ? tx.asset.trim() : "";
    if (rawAsset && rawAsset.toLowerCase() !== "native") {
      return rawAsset.toUpperCase();
    }

    const rawChain = String(tx.chain ?? "").trim().toLowerCase();
    if (!rawChain) return "UNKNOWN";
    return CHAIN_NATIVE_SYMBOLS[rawChain] ?? rawChain.toUpperCase();
  }

  private async resolveUsdPrice(symbol: string): Promise<number | null> {
    const normalized = symbol.toUpperCase();

    const override = this.config.usdPriceOverrides[normalized];
    if (Number.isFinite(override)) {
      return override;
    }

    if (STABLE_USD_SYMBOLS.has(normalized)) {
      return 1;
    }

    const cached = this.usdPriceCache.get(normalized);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.price;
    }

    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(normalized)}USDT`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as { price?: string };
      const price = Number.parseFloat(payload.price ?? "");
      if (!Number.isFinite(price) || price <= 0) {
        return null;
      }
      this.usdPriceCache.set(normalized, {
        price,
        expiresAt: now + 60_000,
      });
      return price;
    } catch {
      return null;
    }
  }

  clearCache(): void {
    this.fallbackBalanceCache = null;
    this.usdPriceCache.clear();
  }
}
