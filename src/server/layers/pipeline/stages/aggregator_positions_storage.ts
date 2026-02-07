import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface AggregatorPositionsEvent {
	type: "position_metrics";
	coin: string;
	data: {
		metrics: {
			columns: string[];
			data: (string | number)[][];
		};
	};
	timestamp: number;
}

export class AggregatorPositionsStorageStage extends PipelineStage<
	AggregatorPositionsEvent,
	{ stored: number }
> {
	id = "aggregator-positions-storage";
	description = "Stores Aggregator Positions to ClickHouse";
	inputs = ["aggregator-positions-source"];
	output = "aggregator-positions-stored";

	public async process(
		data: AggregatorPositionsEvent,
		_context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (
			data.type !== "position_metrics" ||
			!data.data?.metrics?.data ||
			data.data.metrics.data.length === 0
		) {
			return null;
		}

		// data.data.metrics.data has rows. The first row [0] is usually the latest.
		// Columns: ["coin","timestamp","positionCount","positionCountLong","totalPositionValue","totalPositionValueLong"]

		// We will just take the first one (latest) for now to avoid duplications if polling often.
		// Or we could map all of them. `ReplacingMergeTree` handles dedupe by Order By key.
		// Given the source code structure, it sends the full history potentially.
		// Let's iterate all rows to be safe and let ClickHouse deduplicate.

		// However, timestamp is string "2026-02-01T03:07:25.694Z". ClickHouse JSONEachRow creates DateTime.

		const columns = data.data.metrics.columns;
		const tsIdx = columns.indexOf("timestamp");
		const countIdx = columns.indexOf("positionCount");
		const countLongIdx = columns.indexOf("positionCountLong");
		const valIdx = columns.indexOf("totalPositionValue");
		const valLongIdx = columns.indexOf("totalPositionValueLong");

		if (tsIdx === -1) return null;

		const rows = data.data.metrics.data.map((row) => {
			const tsStr = row[tsIdx] as string;
			// Parse ISO string to ms timestamp
			const ts = new Date(tsStr).getTime();

			return {
				coin: data.coin,
				timestamp: ts,
				position_count: Number(row[countIdx]),
				position_count_long: Number(row[countLongIdx]),
				total_value: Number(row[valIdx]),
				total_value_long: Number(row[valLongIdx]),
			};
		});

		try {
			await clickhouse.insert({
				table: "aggregator_positions",
				values: rows,
				format: "JSONEachRow",
			});
			return { stored: rows.length };
		} catch (err) {
			logger.error(
				{ err, count: rows.length },
				"Failed to store Aggregator positions",
			);
			return null;
		}
	}
}
