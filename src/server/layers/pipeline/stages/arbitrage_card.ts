import { logger } from "@/server/utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface MarketSnapshot {
  [exchange: string]: {
    [symbol: string]: number;
  };
}

export interface ArbitrageCardOutput {
  pair: string;
  exchangeBuy: string;
  exchangeSell: string;
  priceBuy: number;
  priceSell: number;
  spreadPercent: number;
  spreadUsd: number;
}

interface ArbitrageOpportunity {
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spreadPercent: number;
  spreadUsd: number;
}

/**
 * ArbitrageCardStage
 *
 * Monitors market-snapshot for arbitrage opportunities.
 * When spread exceeds threshold, emits data ready for imagen arbitrage-spread template.
 * Also forwards data to DataStudio for monitoring.
 */
export class ArbitrageCardStage extends PipelineStage<
  MarketSnapshot,
  ArbitrageCardOutput
> {
  id = "arbitrage-card";
  description = "Detects arbitrage opportunities and outputs imagen-ready data";
  inputs = ["market-snapshot"];
  output = "arbitrage-card";

  private thresholdPercent = 0.05; // Minimum spread % to trigger (lowered for testing)
  private lastEmitTime: Record<string, number> = {};
  private cooldownMs = 60000; // 1 minute cooldown per pair
  private lastDebugLog: number = 0;

  public async process(
    snapshot: MarketSnapshot,
    context: ProcessingContext,
  ): Promise<ArbitrageCardOutput | null> {
    if (context.topic !== "market-snapshot") return null;

    const exchanges = Object.keys(snapshot);

    // Debug: log every 30 seconds
    const now = Date.now();
    if (!this.lastDebugLog || now - this.lastDebugLog > 30000) {
      this.lastDebugLog = now;
      const symbolCount = Object.values(snapshot).reduce(
        (acc, ex) => acc + Object.keys(ex).length,
        0,
      );
      logger.info(
        {
          stage: this.id,
          exchanges: exchanges.length,
          symbols: symbolCount,
          exchangeList: exchanges,
        },
        "ArbitrageCard: Snapshot received",
      );
    }

    if (exchanges.length < 2) return null;

    // Find all symbols across exchanges
    const allSymbols = new Set<string>();
    for (const exchange of exchanges) {
      for (const symbol of Object.keys(snapshot[exchange])) {
        allSymbols.add(symbol);
      }
    }

    // Find best arbitrage opportunity
    let bestOpportunity: ArbitrageOpportunity | null = null;

    for (const symbol of allSymbols) {
      // Get all prices for this symbol across exchanges
      const prices: { exchange: string; price: number }[] = [];

      for (const exchange of exchanges) {
        const price = snapshot[exchange]?.[symbol];
        if (price && price > 0) {
          prices.push({ exchange, price });
        }
      }

      if (prices.length < 2) continue;

      // Find min and max
      prices.sort((a, b) => a.price - b.price);
      const lowest = prices[0];
      const highest = prices[prices.length - 1];

      const spreadUsd = highest.price - lowest.price;
      const spreadPercent = (spreadUsd / lowest.price) * 100;

      // Track best spread even if below threshold (for debug)
      if (!bestOpportunity || spreadPercent > bestOpportunity.spreadPercent) {
        bestOpportunity = {
          symbol,
          buyExchange: lowest.exchange,
          sellExchange: highest.exchange,
          buyPrice: lowest.price,
          sellPrice: highest.price,
          spreadPercent,
          spreadUsd,
        };
      }
    }

    // Debug: log best spread found even if below threshold
    if (bestOpportunity && this.lastDebugLog === now) {
      logger.info(
        {
          stage: this.id,
          symbol: bestOpportunity.symbol,
          spread: bestOpportunity.spreadPercent.toFixed(4),
          threshold: this.thresholdPercent,
          buy: `${bestOpportunity.buyExchange} @ ${bestOpportunity.buyPrice}`,
          sell: `${bestOpportunity.sellExchange} @ ${bestOpportunity.sellPrice}`,
        },
        "ArbitrageCard: Best spread found",
      );
    }

    // Check threshold
    if (
      !bestOpportunity ||
      bestOpportunity.spreadPercent < this.thresholdPercent
    ) {
      return null;
    }

    // Check cooldown
    const cooldownKey = `${bestOpportunity.symbol}-${bestOpportunity.buyExchange}-${bestOpportunity.sellExchange}`;
    const cooldownNow = Date.now();
    const lastEmit = this.lastEmitTime[cooldownKey] || 0;

    if (cooldownNow - lastEmit < this.cooldownMs) {
      return null;
    }

    this.lastEmitTime[cooldownKey] = cooldownNow;

    // Format pair name nicely (BTCUSDT -> BTC / USDT)
    const pair = this.formatPairName(bestOpportunity.symbol);

    // Capitalize exchange names
    const exchangeBuy = this.capitalizeExchange(bestOpportunity.buyExchange);
    const exchangeSell = this.capitalizeExchange(bestOpportunity.sellExchange);

    const output: ArbitrageCardOutput = {
      pair,
      exchangeBuy,
      exchangeSell,
      priceBuy: Math.round(bestOpportunity.buyPrice * 100) / 100,
      priceSell: Math.round(bestOpportunity.sellPrice * 100) / 100,
      spreadPercent: Math.round(bestOpportunity.spreadPercent * 100) / 100,
      spreadUsd: Math.round(bestOpportunity.spreadUsd * 100) / 100,
    };

    logger.info(
      {
        stage: this.id,
        pair: output.pair,
        spread: output.spreadPercent,
        buy: `${output.exchangeBuy} @ ${output.priceBuy}`,
        sell: `${output.exchangeSell} @ ${output.priceSell}`,
      },
      "Arbitrage opportunity detected!",
    );

    return output;
  }

  private formatPairName(symbol: string): string {
    // Common quote currencies
    const quotes = ["USDT", "USDC", "USD", "BUSD", "EUR", "BTC", "ETH"];

    for (const quote of quotes) {
      if (symbol.endsWith(quote)) {
        const base = symbol.slice(0, -quote.length);
        return `${base} / ${quote}`;
      }
    }

    return symbol;
  }

  private capitalizeExchange(exchange: string): string {
    // Handle common exchanges
    const mapping: Record<string, string> = {
      binance: "Binance",
      bybit: "Bybit",
      okx: "OKX",
      kraken: "Kraken",
      coinbase: "Coinbase",
      hyperliquid: "Hyperliquid",
      dydx: "dYdX",
      htx: "HTX",
      kucoin: "KuCoin",
      gate: "Gate.io",
      mexc: "MEXC",
    };

    return (
      mapping[exchange.toLowerCase()] ||
      exchange.charAt(0).toUpperCase() + exchange.slice(1)
    );
  }
}
