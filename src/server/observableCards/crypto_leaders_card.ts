import type { AggregatorLayer } from "../layers/aggregator";
import type {
	AggregatedCryptoBuys,
	AggregatedTrade,
} from "../layers/pipeline/stages/crypto_buy_aggregation";
import { ObservableCard } from "./base";

interface CryptoLeadersSnapshot {
	windowStart: string;
	windowEnd: string;
	stats: {
		symbol: string;
		buyCount: number;
		totalAmount: number;
		totalUsd: number;
		uniqueTraders: number;
		avgBuySize: number;
	}[];
	recentTrades: AggregatedTrade[];
	totalBuys: number;
	totalUsd: number;
	updatedAt: number;
}

export class CryptoLeadersCard extends ObservableCard<
	AggregatedCryptoBuys,
	CryptoLeadersSnapshot
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "crypto-leaders-card",
				title: "Crypto Leaders Activity",
				description: "Real-time 15min aggregation of top trader buys",
				type: "stat",
				inputs: ["crypto-buy-aggregated"],
			},
			{
				windowStart: "",
				windowEnd: "",
				stats: [],
				recentTrades: [],
				totalBuys: 0,
				totalUsd: 0,
				updatedAt: Date.now(),
			},
			aggregator,
		);
	}

	public process(data: AggregatedCryptoBuys, topic: string): void {
		if (topic === "crypto-buy-aggregated") {
			this.snapshot = {
				windowStart: data.windowStart.toISOString(),
				windowEnd: data.windowEnd.toISOString(),
				stats: data.aggregations,
				recentTrades: data.recentTrades || [],
				totalBuys: data.totalBuys,
				totalUsd: data.totalUsd,
				updatedAt: Date.now(),
			};
			// Manually trigger emit since we updated snapshot
			// (Base class doesn't auto-emit on process, we usually do it in aggregator,
			// but ObservableDataLayer polls getSnapshot.
			// If we want push updates, we should emit to aggregator if needed,
			// but usually the frontend relies on polling the card snapshot via API or websocket subscription to card ID)
		}
	}
}
