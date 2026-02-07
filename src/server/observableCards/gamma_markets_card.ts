import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

interface GammaMarketInfo {
	id: string;
	question: string;
	slug: string;
	volume: number;
	outcomes: string; // JSON string
	outcomePrices: string; // JSON string
	timestamp: number;
}

interface GammaCardState {
	newMarkets: GammaMarketInfo[];
	updatedMarkets: GammaMarketInfo[];
}

export class GammaMarketsCard extends ObservableCard<any, GammaCardState> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "gamma-markets-card",
				title: "Polymarket Radar",
				description: "New and Active High-Volume Markets",
				type: "list",
				inputs: ["polymarket-gamma-source"],
			},
			{
				newMarkets: [],
				updatedMarkets: [],
			},
			aggregator,
		);
	}

	public process(data: any, topic: string): void {
		if (topic !== "polymarket-gamma-source") return;
		if (!Array.isArray(data)) return;

		// Data is now an array of markets (full snapshot)
		// We can just display the top ones as "active" or "new"
		// For simplicity, let's treat the incoming list as "Active Markets" (replacing updatedMarkets)
		// and maybe diff for "New"?

		// Ideally, we'd diff against previous snapshot to find truly new ones.
		// For now, let's just populate updatedMarkets with the top volume ones from the feed.

		const markets = data
			.map((market: any) => ({
				id: market.id,
				question: market.question,
				slug: market.slug,
				volume: Number(market.volume) || 0,
				outcomes: market.outcomes,
				outcomePrices: market.outcomePrices,
				timestamp: Date.now(),
			}))
			.slice(0, 20); // Top 20

		// Detect "New" if we have memory?
		// Let's just update the list for now.
		// We'll put them in 'updatedMarkets' tab, and maybe 'newMarkets' if they are new (by creation date?)

		// Sort by createdAt descending for "New" tab
		const sortedByCreated = [...data]
			.sort(
				(a: any, b: any) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			)
			.slice(0, 20)
			.map((market: any) => ({
				id: market.id,
				question: market.question,
				slug: market.slug,
				volume: Number(market.volume) || 0,
				outcomes: market.outcomes,
				outcomePrices: market.outcomePrices,
				timestamp: new Date(market.createdAt).getTime(),
			}));

		this.snapshot.updatedMarkets = markets;
		this.snapshot.newMarkets = sortedByCreated;
	}
}
