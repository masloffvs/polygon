import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface AggregatorPerpVolumeData {
	perpVolume24HoursAgo: number;
	history: {
		data: [string, number][];
	};
}

export class AggregatorPerpVolumeStorageStage extends PipelineStage<
	AggregatorPerpVolumeData,
	{ stored: boolean }
> {
	id = "aggregator-perp-volume-storage";
	description = "Stores Aggregator Perp Volume data into ClickHouse";
	inputs = ["aggregator-perp-volume-source"];
	output = "aggregator-perp-volume-db";

	public async process(
		data: AggregatorPerpVolumeData,
		context: ProcessingContext,
	): Promise<{ stored: boolean } | null> {
		if (context.topic !== "aggregator-perp-volume-source") return null;

		try {
			// Store the snapshot
			const row = {
				volume_24h: data.perpVolume24HoursAgo,
				timestamp: Math.floor(Date.now() / 1000), // Current time for the snapshot
			};

			await clickhouse.insert({
				table: "aggregator_perp_volume",
				values: [row],
				format: "JSONEachRow",
			});

			return { stored: true };
		} catch (err) {
			logger.error({ err }, "Failed to insert aggregator perp volume");
			return { stored: false };
		}
	}
}
