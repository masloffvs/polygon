import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
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

/**
 * Stage that stores/updates Fear & Greed Index history in ClickHouse.
 * Uses ReplacingMergeTree to handle upserts by date.
 */
export class FearGreedStorageStage extends PipelineStage<
	FearGreedBatch,
	{ stored: number; updated: number }
> {
	id = "fear-greed-storage";
	description = "Stores Fear & Greed Index history to ClickHouse";
	inputs = ["fear-greed-source"];
	output = "fear-greed-stored";

	public async process(
		data: FearGreedBatch,
		context: ProcessingContext,
	): Promise<{ stored: number; updated: number } | null> {
		if (context.topic !== "fear-greed-source") return null;
		if (data.type !== "fear_greed_batch") return null;

		const dataList = data.dataList;
		if (!dataList || !Array.isArray(dataList) || dataList.length === 0) {
			return null;
		}

		// Map to ClickHouse rows
		const rows = dataList.map((entry) => ({
			date: new Date(Number(entry.timestamp) * 1000)
				.toISOString()
				.split("T")[0], // YYYY-MM-DD
			score: entry.score,
			sentiment: entry.name,
			btc_price: Number.parseFloat(entry.btcPrice),
			btc_volume: Number.parseFloat(entry.btcVolume),
			timestamp: Number(entry.timestamp),
		}));

		try {
			await clickhouse.insert({
				table: "fear_greed_index",
				values: rows,
				format: "JSONEachRow",
			});

			logger.debug({ count: rows.length }, "Stored Fear & Greed Index entries");

			return { stored: rows.length, updated: 0 };
		} catch (err) {
			logger.error({ err }, "Failed to store Fear & Greed Index");
			return null;
		}
	}
}
