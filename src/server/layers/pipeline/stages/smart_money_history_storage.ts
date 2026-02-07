import { clickhouse } from "@/storage/clickhouse";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { SmartMoneyEvaluationResult } from "./smart_money_evaluation";

export class SmartMoneyHistoryStorageStage extends PipelineStage<
	SmartMoneyEvaluationResult,
	{ stored: number }
> {
	id = "smart-money-history-storage";
	description =
		"Stores evaluated Smart Money prediction outcomes to ClickHouse";
	inputs = ["smart-money-outcomes"];
	output = "smart-money-history-stored";

	public async process(
		data: SmartMoneyEvaluationResult,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "smart-money-outcomes") return null;
		if (!data.outcomes || data.outcomes.length === 0) return null;

		try {
			const rows = data.outcomes.map((o) => ({
				symbol: o.symbol,
				window_start: new Date(o.windowStart)
					.toISOString()
					.replace("T", " ")
					.slice(0, 19),
				phase: o.phase,
				direction: o.direction,
				entry_price: o.entryPrice,
				close_price: o.closePrice,
				max_price: o.maxPrice,
				min_price: o.minPrice,
				pnl_percent: o.pnlPercent,
				is_win: o.isWin ? 1 : 0,
				score: o.score,
				confidence: o.confidence,
				analyzed_at: new Date().toISOString().replace("T", " ").slice(0, 19),
			}));

			// Ensure table exists (optional, could be done in migration or startup)
			// Usually handled by admin, but let's assume table `smart_money_performance`

			await clickhouse.insert({
				table: "smart_money_performance",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info(
				{
					count: rows.length,
					window: new Date(data.windowStart).toISOString(),
				},
				"Stored Smart Money history",
			);

			return { stored: rows.length };
		} catch (err) {
			logger.error({ err }, "Failed to store Smart Money history");
			return null;
		}
	}
}
