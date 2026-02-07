import { clickhouse } from "@/storage/clickhouse";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { ProfitabilitySnapshot } from "./crypto_profitability";

/**
 * Stage that stores crypto trader profitability snapshots to ClickHouse
 */
export class CryptoProfitabilityStorageStage extends PipelineStage<
	ProfitabilitySnapshot,
	{ stored: number }
> {
	id = "crypto-profitability-storage";
	description = "Stores crypto trader performance snapshots to ClickHouse";
	inputs = ["crypto-profitability-update"];
	output = "crypto-profitability-stored";

	public async process(
		data: ProfitabilitySnapshot,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "crypto-profitability-update") return null;

		if (!data.performances || data.performances.length === 0) return null;

		const rows = data.performances.map((p) => ({
			window_start: new Date(data.windowStart)
				.toISOString()
				.replace("T", " ")
				.slice(0, 19),
			window_end: new Date(data.windowEnd)
				.toISOString()
				.replace("T", " ")
				.slice(0, 19),
			user_address: p.userAddress,
			user_name: p.user,
			user_rank: p.userRank,
			asset: p.asset,
			outcome: p.outcome,
			avg_entry_price: p.avgEntryPrice,
			price_to_beat: p.priceToBeat,
			current_spot_price: p.currentSpotPrice,
			price_change_percent: p.priceChangePercent,
			distance_to_beat: p.distanceToBeat,
			is_profitable: p.isProfitable ? 1 : 0,
			total_size: p.totalSize,
		}));

		try {
			await clickhouse.insert({
				table: "crypto_trader_performance_snapshots",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info(
				{ count: rows.length, window: data.windowStart },
				"Stored crypto trader performance snapshot",
			);

			return { stored: rows.length };
		} catch (err) {
			logger.error({ err }, "Failed to store crypto trader performance");
			return null;
		}
	}
}
