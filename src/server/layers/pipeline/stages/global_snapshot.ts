import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { NormalizedOrderBook } from "./normalize";

interface MarketSnapshot {
	[exchange: string]: {
		[symbol: string]: number; // Current Mid-Price
	};
}

export class GlobalSnapshotStage extends PipelineStage<
	NormalizedOrderBook,
	MarketSnapshot
> {
	id = "global-snapshot";
	description =
		"Aggregates latest prices from all exchanges into a single snapshot";
	inputs = ["normalized-books"];
	output = "market-snapshot";

	// State: Exchange -> Symbol -> Price
	private snapshot: MarketSnapshot = {};

	public async process(
		data: NormalizedOrderBook,
		context: ProcessingContext,
	): Promise<MarketSnapshot | null> {
		if (context.topic !== "normalized-books") return null;

		const { source, symbol, bids, asks } = data;

		// Need minimal data to calc mid price
		if (bids.length === 0 || asks.length === 0) return null;

		const bestBid = bids[0][0];
		const bestAsk = asks[0][0];
		const midPrice = (bestBid + bestAsk) / 2;

		// Clean source name (remove -source suffix)
		const exchange = source.replace("-source", "");

		// Update state
		if (!this.snapshot[exchange]) {
			this.snapshot[exchange] = {};
		}

		this.snapshot[exchange][symbol] = midPrice;

		// Emit the full snapshot every time?
		// Or maybe throttle it? For now, real-time updates.
		// Cloning to avoid mutation issues downstream if any
		return JSON.parse(JSON.stringify(this.snapshot));
	}
}
