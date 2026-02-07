import { clickhouse } from "@/storage/clickhouse";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class PolymarketPennyWhaleStage extends PipelineStage<any, any> {
	id = "polymarket-penny-whale-stage";
	description = "Filters for large low-price trades (<$0.20, >$20k)";
	inputs = ["polyscan-ws-source"];
	output = "polymarket-penny-whales";

	public async process(
		data: any,
		context: ProcessingContext,
	): Promise<any | null> {
		// Check input topic
		if (context.topic !== "polyscan-ws-source") return null;

		// Handle RealtimeEvent structure from PolyscanWsSource
		// The source emits { type, trade?, whaleTrade?, ... }
		// If data.price exists, it might already be unwrapped (backward compatibility), otherwise look for trade/whaleTrade
		const trade =
			data.price !== undefined ? data : data.trade || data.whaleTrade;

		if (!trade || typeof trade.price !== "number") return null;

		// Check conditions
		const price = trade.price;
		const value = trade.price * trade.size; // Assuming size is shares

		if (price < 0.2 && value > 20000) {
			// It's a match!

			// 1. Store to ClickHouse
			try {
				await clickhouse.insert({
					table: "polymarket_penny_whales",
					values: [
						{
							transactionHash: trade.transactionHash,
							asset: trade.asset,
							title: trade.title,
							outcome: trade.outcome,
							side: trade.side,
							price: trade.price,
							size: trade.size,
							value: value,
							timestamp: Math.floor(trade.timestamp / 1000), // Ensure unix timestamp
							user: trade.proxyWallet
								? trade.proxyWallet.slice(0, 8)
								: "unknown",
						},
					],
					format: "JSONEachRow",
				});
			} catch (err) {
				logger.error({ err }, "Failed to store penny whale trade");
			}

			// 2. Emit for Observable Card
			return {
				...trade,
				computedValue: value,
				detectedAt: Date.now(),
			};
		}

		return null;
	}
}
