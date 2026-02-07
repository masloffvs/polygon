import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { NormalizedOrderBook } from "./normalize";

export interface GlobalPriceEvent {
  symbol: string;
  midPrice: number;
  spread: number;
  sources: number; // Count of sources contributing
  components: { source: string; price: number }[];
  timestamp: number;
}

export class PriceAveragerStage extends PipelineStage<
  NormalizedOrderBook,
  GlobalPriceEvent
> {
  id = "price-averager";
  description = "Calculates Global Average Price from Normalized Books";
  inputs = ["normalized-books"];
  output = "global-price";

  // Cache latest mid-price per source/symbol
  // Symbol -> Source -> { price, timestamp }
  private priceCache = new Map<
    string,
    Map<string, { price: number; timestamp: number }>
  >();

  public async process(
    data: NormalizedOrderBook,
    _context: ProcessingContext,
  ): Promise<GlobalPriceEvent | null> {
    const { symbol, source, bids, asks } = data;

    if (bids.length === 0 || asks.length === 0) return null;

    const topBid = bids[0];
    const topAsk = asks[0];
    if (topBid === undefined || topAsk === undefined) return null;

    const bestBid = topBid[0];
    const bestAsk = topAsk[0];
    const midPrice = (bestBid + bestAsk) / 2;

    // Update Cache
    if (!this.priceCache.has(symbol)) {
      this.priceCache.set(symbol, new Map());
    }
    const symbolCache = this.priceCache.get(symbol)!;
    symbolCache.set(source, { price: midPrice, timestamp: Date.now() });

    // Calculate Global Average
    // Filter out stale prices (> 5 seconds old)
    const now = Date.now();
    const activePrices: { source: string; price: number }[] = [];

    for (const [src, entry] of symbolCache.entries()) {
      if (now - entry.timestamp < 5000) {
        activePrices.push({ source: src, price: entry.price });
      }
    }

    if (activePrices.length === 0) return null;

    const sum = activePrices.reduce((acc, curr) => acc + curr.price, 0);
    const average = sum / activePrices.length;

    if (process.env.NODE_ENV === "development") {
      logger.info(
        { symbol, average, contributors: activePrices.length },
        "PriceAverager: Calculated",
      );
    }

    // Calculate generic spread (max - min of averages? or logic?)
    // Just returning spread of the current update source for context?
    // Let's return the Max Spread between sources if multiple exist
    let spread = 0;
    if (activePrices.length > 1) {
      const prices = activePrices.map((p) => p.price);
      spread = Math.max(...prices) - Math.min(...prices);
    } else {
      spread = bestAsk - bestBid; // Fallback to local spread
    }

    return {
      symbol,
      midPrice: average,
      spread,
      sources: activePrices.length,
      components: activePrices,
      timestamp: now,
    };
  }
}
