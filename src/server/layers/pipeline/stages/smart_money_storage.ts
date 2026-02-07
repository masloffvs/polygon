import { clickhouse } from "@/storage/clickhouse";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type {
	SmartMoneyPrediction,
	SmartMoneyPredictionBatch,
} from "./smart_money_prediction";

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT TYPE
// ═══════════════════════════════════════════════════════════════════════════

export interface StorageResult {
	stored: number;
	windowStart: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE STAGE
// ═══════════════════════════════════════════════════════════════════════════

export class SmartMoneyStorageStage extends PipelineStage<
	SmartMoneyPredictionBatch,
	StorageResult
> {
	id = "smart-money-storage";
	description = "Persists Smart Money predictions to ClickHouse";
	inputs = ["smart-money-predictions"];
	output = "smart-money-stored";

	public async process(
		data: SmartMoneyPredictionBatch,
		context: ProcessingContext,
	): Promise<StorageResult | null> {
		if (context.topic !== "smart-money-predictions") return null;
		if (!data.predictions || data.predictions.length === 0) return null;

		try {
			const rows = data.predictions.map((p: SmartMoneyPrediction) => ({
				symbol: p.symbol,
				window_start: new Date(p.windowStart),
				phase: p.phase,
				direction: p.direction,
				confidence: p.confidence,
				score: p.score,
				open_price: p.openPrice,
				entry_price: p.entryPrice,

				ls_ratio: p.signals.lsRatio ?? null,
				ls_freshness: p.signals.lsFreshness ?? null,
				orderbook_imbalance: p.signals.orderBookImbalance ?? null,
				orderbook_freshness: p.signals.orderBookFreshness ?? null,
				tv_tech_rating: p.signals.tvTechRating ?? null,
				tv_freshness: p.signals.tvFreshness ?? null,
				tu_score: p.signals.tuScore ?? null,
				tu_freshness: p.signals.tuFreshness ?? null,

				data_completeness: p.dataCompleteness,

				predicted_at: new Date(p.predictedAt),
			}));

			await clickhouse.insert({
				table: "smart_money_predictions",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info(
				{
					count: rows.length,
					windowStart: new Date(data.windowStart).toISOString(),
					symbols: data.predictions.map((p) => p.symbol),
				},
				"Stored Smart Money predictions to ClickHouse",
			);

			return {
				stored: rows.length,
				windowStart: data.windowStart,
			};
		} catch (err) {
			logger.error({ err }, "Failed to store Smart Money predictions");
			return null;
		}
	}
}
