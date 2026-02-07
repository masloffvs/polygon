import type { TradingViewTechEvent } from "@/server/adapters/tradingview_tech";
import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { TRADINGVIEW_TECH_COLUMNS } from "../../sources/tradingview_tech";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class TradingViewTechStorageStage extends PipelineStage<
	TradingViewTechEvent,
	{ stored: number }
> {
	id = "tradingview-tech-storage";
	description = "Stores TradingView Tech Analysis data to ClickHouse";
	inputs = ["tradingview-tech-source"];
	output = "tradingview-tech-stored";

	public async process(
		data: TradingViewTechEvent,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "tradingview-tech-source") return null;

		if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
			return null;
		}

		try {
			const timestamp = Math.floor(Date.now() / 1000);
			const rows = data.data.map((item) => {
				const d = item.d;

				// Helper to get value by column name safely
				const getVal = (col: string) => {
					const idx = TRADINGVIEW_TECH_COLUMNS.indexOf(col);
					return idx !== -1 ? d[idx] : null;
				};

				return {
					symbol: item.s,
					rank: getVal("crypto_total_rank") || 0,
					tech_rating: getVal("TechRating_1D") || "",
					ma_rating: getVal("MARating_1D") || "",
					os_rating: getVal("OsRating_1D") || "",
					rsi: Number(getVal("RSI")) || null,
					mom: Number(getVal("Mom")) || null,
					ao: Number(getVal("AO")) || null,
					cci20: Number(getVal("CCI20")) || null,
					stoch_k: Number(getVal("Stoch.K")) || null,
					stoch_d: Number(getVal("Stoch.D")) || null,

					// Candle Patterns (0 or 1 usually)
					candle_3_black_crows: Number(getVal("Candle.3BlackCrows")) || 0,
					candle_3_white_soldiers: Number(getVal("Candle.3WhiteSoldiers")) || 0,
					candle_engulfing_bearish:
						Number(getVal("Candle.Engulfing.Bearish")) || 0,
					candle_engulfing_bullish:
						Number(getVal("Candle.Engulfing.Bullish")) || 0,
					candle_morning_star: Number(getVal("Candle.MorningStar")) || 0,
					candle_evening_star: Number(getVal("Candle.EveningStar")) || 0,
					candle_doji: Number(getVal("Candle.Doji")) || 0,
					candle_hammer: Number(getVal("Candle.Hammer")) || 0,
					candle_shooting_star: Number(getVal("Candle.ShootingStar")) || 0,

					ingested_at: timestamp,
				};
			});

			await clickhouse.insert({
				table: "tradingview_tech_analysis",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info(
				{ count: rows.length },
				"Stored TradingView tech analysis data",
			);
			return { stored: rows.length };
		} catch (err) {
			logger.error({ err }, "Failed to store TradingView tech analysis data");
			return null;
		}
	}
}
