import { clickhouse } from "../../../../storage/clickhouse";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class PolymarketGammaStorageStage extends PipelineStage<any[], any[]> {
	id = "polymarket-gamma-storage";
	description = "Stores Polymarket Gamma API events to ClickHouse";
	inputs = ["polymarket-gamma-source"];
	output = "polymarket-gamma-stored";

	public async process(
		data: any[],
		context: ProcessingContext,
	): Promise<any[] | null> {
		if (context.topic !== "polymarket-gamma-source") return null;
		if (!Array.isArray(data)) return null;

		try {
			// Logic: In HttpObserver mode, we get a full dump.
			// We'll insert ALL of them with eventType = 'snapshot' for simplicity?
			// Or we just insert them all. Let's insert all as snapshot for now.
			// This might spam DB if interval is short (1 min).
			// Ideally we should diff here too, but for now lets just save the top ones.

			const rows = data.map((market) => ({
				marketId: market.id,
				eventType: "snapshot",
				question: market.question,
				slug: market.slug,
				volume: Number(market.volume) || 0,
				liquidity: Number(market.liquidity) || 0,
				timestamp: Math.floor(Date.now() / 1000),
			}));

			await clickhouse.insert({
				table: "polymarket_gamma_events",
				values: rows,
				format: "JSONEachRow",
			});
		} catch (err) {
			logger.error({ err }, "Failed to store gamma event");
		}

		return data;
	}
}
