import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface AggregatorEquityDistributionData {
	totalEquity: number;
	totalWalletsCount: number;
	buckets: any[];
}

export class AggregatorEquityDistributionStorageStage extends PipelineStage<
	AggregatorEquityDistributionData,
	{ stored: boolean }
> {
	id = "aggregator-equity-distribution-storage";
	description = "Stores Aggregator Equity Distribution data into ClickHouse";
	inputs = ["aggregator-equity-distribution-source"];
	output = "aggregator-equity-distribution-db";

	public async process(
		data: AggregatorEquityDistributionData,
		context: ProcessingContext,
	): Promise<{ stored: boolean } | null> {
		if (context.topic !== "aggregator-equity-distribution-source") return null;

		try {
			const row = {
				total_equity: data.totalEquity,
				total_wallets: data.totalWalletsCount,
				buckets_json: JSON.stringify(data.buckets),
				timestamp: Math.floor(Date.now() / 1000),
			};

			await clickhouse.insert({
				table: "aggregator_equity_distribution",
				values: [row],
				format: "JSONEachRow",
			});

			return { stored: true };
		} catch (err) {
			logger.error({ err }, "Failed to insert aggregator equity distribution");
			return { stored: false };
		}
	}
}
