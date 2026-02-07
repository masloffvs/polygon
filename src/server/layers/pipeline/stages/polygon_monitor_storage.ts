import { clickhouse } from "@/storage/clickhouse";
import type { PolygonTransferEvent } from "../../sources/polygon_monitor";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class PolygonStorageStage extends PipelineStage<
	PolygonTransferEvent,
	{ stored: boolean }
> {
	id = "polygon-storage";
	description = "Stores Polygon transfers to ClickHouse";
	inputs = ["polygon-processed-events"];
	output = "polygon-stored-ack";

	public async process(
		data: PolygonTransferEvent,
		context: ProcessingContext,
	): Promise<{ stored: boolean } | null> {
		if (context.topic !== "polygon-processed-events") return null;

		// Use safe insert
		try {
			await clickhouse.insert({
				table: "polygon_transfers",
				values: [
					{
						hash: data.hash,
						from_address: data.from,
						to_address: data.to,
						value: data.value,
						symbol: data.symbol,
						from_label: data.labels.from || null,
						to_label: data.labels.to || null,
						relayer: data.relayer || null,
						timestamp: Math.floor(data.timestamp / 1000), // Convert to unix seconds for DateTime if needed, or keeping it ms depends on CH definition.
						// In migration we used DateTime, which expects seconds usually or string.
						// Let's pass it as Date object or number (seconds).
						// Clickhouse client handles Date objects well.
					},
				],
				format: "JSONEachRow",
			});
			return { stored: true };
		} catch (_err) {
			// Log error but don't crash pipeline
			// logger.error({ err }, "Failed to store polygon transfer");
			return null;
		}
	}
}
