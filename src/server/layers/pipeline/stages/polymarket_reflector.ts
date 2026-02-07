import { clickhouse } from "@/storage/clickhouse";
import type { RealtimeEvent } from "../../../integrations/polymarket/realtime-client";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class PolymarketActivityReflectorStage extends PipelineStage<
	RealtimeEvent,
	{ stored: number }
> {
	id = "polymarket-activity-reflector";
	description = "Reflects Polymarket realtime activity to ClickHouse";
	inputs = ["polyscan-ws-source"];
	output = "polymarket-activity-stream";

	public async process(
		data: RealtimeEvent,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "polyscan-ws-source") return null;

		if (data.type !== "trade" && data.type !== "whale") return null;

		const trade = data.whaleTrade || data.trade;
		if (!trade) return null;

		const row = {
			transactionHash: trade.transactionHash,
			timestamp: trade.timestamp, // Already in seconds from Polymarket
			side: trade.side,
			asset: trade.asset,
			title: trade.title,
			size: trade.size,
			price: trade.price,
			usdcValue: trade.size * trade.price,
			proxyWallet: trade.proxyWallet,
			outcome: trade.outcome,
			eventSlug: trade.eventSlug,
		};

		try {
			await clickhouse.insert({
				table: "polymarket_activity",
				values: [row],
				format: "JSONEachRow",
			});
			// logger.debug({ tx: trade.transactionHash }, "Stored Polymarket activity");
			return { stored: 1 };
		} catch (err) {
			logger.error({ err }, "Failed to store Polymarket activity");
			return null;
		}
	}
}
