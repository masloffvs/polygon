import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface HyperliquidMidsEvent {
	type: "hyperliquid_mids";
	mids: Record<string, string>;
	timestamp: number;
}

export class HyperliquidStorageStage extends PipelineStage<
	HyperliquidMidsEvent,
	{ stored: number }
> {
	id = "hyperliquid-storage";
	description = "Stores Hyperliquid Mids to ClickHouse";
	inputs = ["hyperliquid-source"];
	output = "hyperliquid-stored";

	public async process(
		data: HyperliquidMidsEvent,
		_context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (data.type !== "hyperliquid_mids" || !data.mids) {
			return null;
		}

		const rows = Object.entries(data.mids).map(([symbol, priceStr]) => ({
			symbol,
			price: parseFloat(priceStr),
			timestamp: data.timestamp, // ms
		}));

		if (rows.length === 0) return null;

		try {
			await clickhouse.insert({
				table: "hyperliquid_mids",
				values: rows,
				format: "JSONEachRow",
			});
			return { stored: rows.length };
		} catch (err) {
			logger.error(
				{ err, count: rows.length },
				"Failed to store Hyperliquid mids",
			);
			return null;
		}
	}
}
