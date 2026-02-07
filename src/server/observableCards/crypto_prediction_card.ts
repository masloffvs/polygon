import type { AggregatorLayer } from "../layers/aggregator";
import type { ProfitabilitySnapshot } from "../layers/pipeline/stages/crypto_profitability";
import { ObservableCard } from "./base";

interface PredictionSnapshot {
	windowStart: number;
	windowEnd: number; // Added windowEnd
	accuracy: number; // Percentage of profitable volume
	totalVolume: number;
	profitableVolume: number;
	longRatio: number; // % of volume that is Long/UP/YES
	topTraders: {
		user: string;
		userAddress: string; // Added address for linking
		asset: string;
		pnl: number; // % move captured (priceChangePercent)
		outcome: string;
		size: number;
		avgEntry: number; // Add detailed entry info
		currentPrice: number; // Add detailed current price
	}[];
	assetStats: {
		symbol: string;
		accuracy: number;
		volume: number;
	}[];
}

export class CryptoPredictionCard extends ObservableCard<
	ProfitabilitySnapshot,
	PredictionSnapshot
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "crypto-prediction-card",
				title: "Whale Prediction Accuracy",
				description: "Real-time tracking of leader profitability vs spot price",
				type: "stat",
				inputs: ["crypto-profitability-update"],
			},
			{
				windowStart: 0,
				windowEnd: 0,
				accuracy: 0,
				totalVolume: 0,
				profitableVolume: 0,
				longRatio: 0,
				topTraders: [],
				assetStats: [],
			},
			aggregator,
		);
	}

	public process(data: ProfitabilitySnapshot, topic: string): void {
		if (topic === "crypto-profitability-update") {
			const performances = data.performances;
			if (performances.length === 0) return;

			let totalVol = 0;
			let profitVol = 0;
			let longVol = 0;
			const assetMap = new Map<string, { total: number; profit: number }>();

			for (const p of performances) {
				totalVol += p.totalSize; // Using raw size for now, ideally USD value if available in stage
				if (p.isProfitable) {
					profitVol += p.totalSize;
				}

				const isLong =
					p.outcome.toUpperCase() === "UP" || p.outcome.toUpperCase() === "YES";
				if (isLong) {
					longVol += p.totalSize;
				}

				// Asset Stats
				const stats = assetMap.get(p.asset) || { total: 0, profit: 0 };
				stats.total += p.totalSize;
				if (p.isProfitable) stats.profit += p.totalSize;
				assetMap.set(p.asset, stats);
			}

			// Top Traders (Sort by size * abs(pnl) to find most impactful smart moves, or just size?)
			// User requested "all info". Let's pass more traders, maybe top 20 by size
			const topTraders = performances
				.sort((a, b) => b.totalSize - a.totalSize) // Sort by size
				.slice(0, 50) // More coverage for modal
				.map((p) => {
					const isLong =
						p.outcome.toUpperCase() === "UP" ||
						p.outcome.toUpperCase() === "YES";
					// Invert PnL for Shorts (Down/No)
					// If Price Change is -1% (Down):
					// Long: -1% PnL
					// Short: -(-1%) = +1% PnL
					const tradePnL = isLong
						? p.priceChangePercent
						: -p.priceChangePercent;

					return {
						user: p.user,
						userAddress: p.userAddress,
						asset: p.asset,
						pnl: tradePnL,
						outcome: p.outcome,
						size: p.totalSize,
						avgEntry: p.avgEntryPrice,
						currentPrice: p.currentSpotPrice,
					};
				});

			const assetStats = Array.from(assetMap.entries()).map(
				([symbol, stats]) => ({
					symbol,
					accuracy: stats.total > 0 ? (stats.profit / stats.total) * 100 : 0,
					volume: stats.total,
				}),
			);

			this.snapshot = {
				windowStart: data.windowStart,
				windowEnd: data.windowEnd,
				accuracy: totalVol > 0 ? (profitVol / totalVol) * 100 : 0,
				totalVolume: totalVol,
				profitableVolume: profitVol,
				longRatio: totalVol > 0 ? (longVol / totalVol) * 100 : 0,
				topTraders,
				assetStats,
			};
		}
	}
}
