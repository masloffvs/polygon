import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface AggregatorLiquidationsEvent {
	type: "liquidation_heatmap";
	coin: string;
	data: {
		heatmap: {
			coin: string;
			priceBinIndex: number;
			priceBinStart: number;
			priceBinEnd: number;
			liquidationValue: number;
			positionsCount: number;
			mostImpactedSegment: number;
		}[];
	};
	timestamp: number;
}

export class AggregatorLiquidationsStorageStage extends PipelineStage<
	AggregatorLiquidationsEvent,
	{ stored: number }
> {
	id = "aggregator-liquidations-storage";
	description = "Stores Aggregator Liquidations to ClickHouse";
	inputs = ["aggregator-liquidations-source"];
	output = "aggregator-liquidations-stored";

	public async process(
		data: AggregatorLiquidationsEvent,
		_context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (data.type !== "liquidation_heatmap" || !data.data?.heatmap) {
			return null;
		}

		const rows = data.data.heatmap.map((item) => ({
			coin: data.coin,
			price_bin_start: item.priceBinStart,
			price_bin_end: item.priceBinEnd,
			liquidation_value: item.liquidationValue,
			positions_count: item.positionsCount,
			timestamp: data.timestamp, // This is the polling time
		}));

		if (rows.length === 0) return null;

		try {
			await clickhouse.insert({
				table: "aggregator_liquidations",
				values: rows,
				format: "JSONEachRow",
			});
			return { stored: rows.length };
		} catch (err) {
			logger.error(
				{ err, count: rows.length },
				"Failed to store Aggregator liquidations",
			);
			return null;
		}
	}
}
