import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { NormalizedOrderBook } from "./normalize";

interface ExchangePrice {
	bestBid: number; // Highest price someone buys
	bestAsk: number; // Lowest price someone sells
	timestamp: number;
}

interface ArbitrageOpportunity {
	symbol: string;
	buyExchange: string; // Exchange with lowest Ask
	sellExchange: string; // Exchange with highest Bid
	buyPrice: number;
	sellPrice: number;
	spread: number;
	spreadPercentage: number;
	timestamp: number;
}

export class CryptoArbitrageStage extends PipelineStage<
	NormalizedOrderBook,
	ArbitrageOpportunity
> {
	id = "crypto-arbitrage";
	description = "Calculates price spreads and arbitrage between exchanges";
	inputs = ["normalized-books"];
	output = "crypto-arbitrage-opportunities";

	// State: Symbol -> Exchange -> Price Data
	private marketState = new Map<string, Map<string, ExchangePrice>>();

	public async process(
		data: NormalizedOrderBook,
		context: ProcessingContext,
	): Promise<ArbitrageOpportunity | null> {
		if (context.topic !== "normalized-books") return null;

		const { source, symbol, bids, asks } = data;

		// Need at least one bid and one ask to determine price
		if (bids.length === 0 || asks.length === 0) return null;

		const bestBid = bids[0][0]; // Highest Bid
		const bestAsk = asks[0][0]; // Lowest Ask

		// Update State
		if (!this.marketState.has(symbol)) {
			this.marketState.set(symbol, new Map());
		}
		const symbolState = this.marketState.get(symbol)!;
		symbolState.set(source, {
			bestBid,
			bestAsk,
			timestamp: Date.now(),
		});

		// Prune stale data (older than 10s)
		const now = Date.now();
		for (const [exch, price] of symbolState.entries()) {
			if (now - price.timestamp > 10000) {
				symbolState.delete(exch);
			}
		}

		// Need at least 2 exchanges to compare
		if (symbolState.size < 2) return null;

		// Find Global Best Bid (Sell Opportunity)
		let maxBid = -Infinity;
		let maxBidExchange = "";

		// Find Global Lowest Ask (Buy Opportunity)
		let minAsk = Infinity;
		let minAskExchange = "";

		for (const [exch, price] of symbolState.entries()) {
			if (price.bestBid > maxBid) {
				maxBid = price.bestBid;
				maxBidExchange = exch;
			}
			if (price.bestAsk < minAsk) {
				minAsk = price.bestAsk;
				minAskExchange = exch;
			}
		}

		// If we have valid cross-exchange prices
		if (maxBidExchange && minAskExchange && maxBidExchange !== minAskExchange) {
			const spread = maxBid - minAsk;
			const spreadPct = (spread / minAsk) * 100;

			// Only emit interesting data?
			// User asked for "realtime calculate spreads", monitoring logic.
			// We will emit always, downstream can filter or visualize.

			// Clean up names for display
			const cleanBuy = minAskExchange.replace("-source", "").toUpperCase();
			const cleanSell = maxBidExchange.replace("-source", "").toUpperCase();

			return {
				symbol,
				buyExchange: cleanBuy,
				sellExchange: cleanSell,
				buyPrice: minAsk,
				sellPrice: maxBid,
				spread,
				spreadPercentage: spreadPct,
				timestamp: Date.now(),
			};
		}

		return null;
	}
}
