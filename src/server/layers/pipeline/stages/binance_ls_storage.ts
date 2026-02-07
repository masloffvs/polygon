import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { AggregatedLongShort } from "./binance_ls_aggregation";

export class BinanceLongShortStorageStage extends PipelineStage<
	AggregatedLongShort,
	{ stored: number }
> {
	id = "binance-ls-storage";
	description = "Stores Aggregated LS Ratios to ClickHouse";
	inputs = ["binance-ls-aggregated"];
	output = "binance-ls-stored";

	public async process(
		data: AggregatedLongShort,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "binance-ls-aggregated") return null;

		const values: any[] = [];
		const now = Math.floor(Date.now() / 1000);

		for (const [symbol, metrics] of Object.entries(data)) {
			values.push({
				symbol: symbol,
				ratio: metrics.ratio,
				long_acc: metrics.longAccount,
				short_acc: metrics.shortAccount,
				timestamp: Math.floor(metrics.timestamp / 1000), // source is ms likely, check adapter
				ingested_at: now,
			});
		}

		if (values.length === 0) return null;

		try {
			// We only want to insert *new* unique timestamps/symbols to avoid dupes per emit
			// Normally aggregating stage emits full state every time a single source updates.
			// We might be over-writing.
			// ClickHouse ReplacingMergeTree handles dedup if we use correct keys.
			// Let's assume we create table with (symbol, timestamp) key.

			await clickhouse.insert({
				table: "binance_ls_ratio",
				values: values,
				format: "JSONEachRow",
			});

			return { stored: values.length };
		} catch (err) {
			logger.error({ err }, "Failed to store Binance LS data");
			return null;
		}
	}
}

export async function runBinanceLSMigrations() {
	await clickhouse.exec({
		query: `
        CREATE TABLE IF NOT EXISTS binance_ls_ratio (
            symbol String,
            ratio Float64,
            long_acc Float64,
            short_acc Float64,
            timestamp DateTime,
            ingested_at DateTime DEFAULT now()
        )
        ENGINE = ReplacingMergeTree()
        ORDER BY (symbol, timestamp)
        `,
	});
}
