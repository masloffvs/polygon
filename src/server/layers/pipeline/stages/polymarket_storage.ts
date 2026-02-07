import { clickhouse } from "@/storage/clickhouse";
import type { PositionEvent } from "../../../integrations/polymarket/types";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class PolymarketStorageStage extends PipelineStage<
	PositionEvent,
	{ stored: number }
> {
	id = "polymarket-storage";
	description = "Stores Polymarket positions in ClickHouse";
	inputs = ["polyscan-source"];
	output = "polymarket-stream";

	public async process(
		data: PositionEvent | any,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "polyscan-source") return null;

		// We only care about events that contain positions for now
		const positions =
			data.type === "update"
				? data.positions
				: data.type === "new"
					? data.newPositions
					: null;

		if (!positions || positions.length === 0) return null;

		const timestamp = Math.floor(new Date(data.timestamp).getTime() / 1000);

		const rows = positions.map((p: any) => ({
			user: data.user,
			conditionId: p.conditionId ?? "",
			asset: p.asset ?? "",
			title: p.title ?? "",
			size: Number(p.size || 0),
			price: Number(p.price || 0),
			value: Number(p.value || 0),
			symbol: p.symbol ?? "",
			outcomeIndex: Number(p.outcomeIndex || 0),
			timestamp: timestamp,
		}));

		try {
			await clickhouse.insert({
				table: "polymarket_positions",
				values: rows,
				format: "JSONEachRow",
			});
			logger.info(
				{ count: rows.length, user: data.user },
				"Stored Polymarket positions",
			);
			return { stored: rows.length };
		} catch (err) {
			logger.error({ err }, "Failed to store Polymarket positions");
			return null;
		}
	}
}
