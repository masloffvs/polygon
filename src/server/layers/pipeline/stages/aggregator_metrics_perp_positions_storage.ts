import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface AggregatorMetricsPerpPositionsData {
	data24HoursAgo: {
		data: [number, number, number, number]; // [totalOpenInterest, totalOpenPositions, perpEquity, countInProfit]
	};
}

export class AggregatorMetricsPerpPositionsStorageStage extends PipelineStage<
	AggregatorMetricsPerpPositionsData,
	{ stored: boolean }
> {
	id = "aggregator-metrics-perp-positions-storage";
	description = "Stores Aggregator Metrics Perp Positions data into ClickHouse";
	inputs = ["aggregator-metrics-perp-positions-source"];
	output = "aggregator-metrics-perp-positions-db";

	public async process(
		data: AggregatorMetricsPerpPositionsData,
		context: ProcessingContext,
	): Promise<{ stored: boolean } | null> {
		if (context.topic !== "aggregator-metrics-perp-positions-source")
			return null;

		try {
			const d = data.data24HoursAgo.data;
			if (!d || d.length < 4) return null;

			const row = {
				total_open_interest: d[0],
				total_open_positions: d[1],
				perp_equity: d[2],
				count_in_profit: d[3],
				timestamp: Math.floor(Date.now() / 1000),
			};

			await clickhouse.insert({
				table: "aggregator_metrics_perp_positions",
				values: [row],
				format: "JSONEachRow",
			});

			return { stored: true };
		} catch (err) {
			logger.error(
				{ err },
				"Failed to insert aggregator metrics perp positions",
			);
			return { stored: false };
		}
	}
}
