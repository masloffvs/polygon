import { getSentimentFromScore } from "@/server/adapters/fear-greed";
import { logger } from "@/server/utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface FearGreedEntry {
	score: number;
	name: string;
	timestamp: string;
	btcPrice: string;
	btcVolume: string;
}

interface FearGreedBatch {
	type: "fear_greed_batch";
	dataList: FearGreedEntry[];
	fetchedAt: number;
}

export interface CurrentFearGreedIndex {
	score: number;
	sentiment: string;
	btcPrice: number;
	btcVolume: number;
	date: string;
	timestamp: number;
	change24h: number | null;
	change7d: number | null;
}

/**
 * Stage that computes the current (latest) Fear & Greed Index
 * and calculates changes over 24h and 7d.
 */
export class FearGreedCurrentStage extends PipelineStage<
	FearGreedBatch,
	CurrentFearGreedIndex
> {
	id = "fear-greed-current";
	description = "Computes current Fear & Greed Index with changes";
	inputs = ["fear-greed-source"];
	output = "fear-greed-current";

	public async process(
		data: FearGreedBatch,
		context: ProcessingContext,
	): Promise<CurrentFearGreedIndex | null> {
		if (context.topic !== "fear-greed-source") return null;
		if (data.type !== "fear_greed_batch") return null;

		const dataList = data.dataList;
		if (!dataList || !Array.isArray(dataList) || dataList.length === 0) {
			return null;
		}

		// Sort by timestamp descending to get latest first
		const sorted = [...dataList].sort(
			(a, b) => Number(b.timestamp) - Number(a.timestamp),
		);

		const latest = sorted[0];
		if (!latest) {
			return null;
		}

		const latestTs = Number(latest.timestamp);

		// Find 24h ago entry (closest to 24h back)
		const ts24hAgo = latestTs - 24 * 60 * 60;
		const entry24h = this.findClosestEntry(sorted, ts24hAgo);

		// Find 7d ago entry
		const ts7dAgo = latestTs - 7 * 24 * 60 * 60;
		const entry7d = this.findClosestEntry(sorted, ts7dAgo);

		const currentIndex: CurrentFearGreedIndex = {
			score: latest.score,
			sentiment: getSentimentFromScore(latest.score),
			btcPrice: Number.parseFloat(latest.btcPrice),
			btcVolume: Number.parseFloat(latest.btcVolume),
			date: new Date(latestTs * 1000).toISOString().split("T")[0] ?? "",
			timestamp: latestTs,
			change24h: entry24h ? latest.score - entry24h.score : null,
			change7d: entry7d ? latest.score - entry7d.score : null,
		};

		logger.info(
			{
				score: currentIndex.score,
				sentiment: currentIndex.sentiment,
				change24h: currentIndex.change24h,
				change7d: currentIndex.change7d,
			},
			"Current Fear & Greed Index computed",
		);

		return currentIndex;
	}

	private findClosestEntry(
		sorted: FearGreedEntry[],
		targetTs: number,
	): FearGreedEntry | null {
		let closest: FearGreedEntry | null = null;
		let minDiff = Number.POSITIVE_INFINITY;

		for (const entry of sorted) {
			const ts = Number(entry.timestamp);
			const diff = Math.abs(ts - targetTs);
			// Only consider entries that are older than or equal to target
			if (ts <= targetTs && diff < minDiff) {
				minDiff = diff;
				closest = entry;
			}
		}

		// Allow up to 2 days tolerance
		if (minDiff > 2 * 24 * 60 * 60) {
			return null;
		}

		return closest;
	}
}
