import type { TradersUnionEvent } from "@/server/adapters/traders_union";
import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class TradersUnionStorageStage extends PipelineStage<
	TradersUnionEvent,
	{ stored: boolean }
> {
	id = "traders-union-storage";
	description = "Stores Traders Union technical analysis to ClickHouse";
	inputs = ["traders-union-source"];
	output = "traders-union-stored";

	public async process(
		data: TradersUnionEvent,
		context: ProcessingContext,
	): Promise<{ stored: boolean } | null> {
		if (context.topic !== "traders-union-source") return null;

		if (data.status !== "success" || !data.data) {
			return null;
		}

		try {
			const timestamp = Math.floor(Date.now() / 1000);
			const tickerId = data.data.ticker_id;

			// We will store the M5 (5 minute) analysis as the primary signal since that's what was in the example
			// Or checking if other timeframes exist. The example showed 'm5'.
			const timeframe = data.data.m5;

			if (!timeframe) {
				return null;
			}

			// Extract indicators
			const getIndicator = (type: string) =>
				timeframe.indicators.find((i) => i.type === type);

			const _ma = getIndicator("moving_average");
			const macd = getIndicator("macd");
			const momentum = getIndicator("momentum");
			const _ichimoku = getIndicator("ichimoku");
			const ao = getIndicator("awesome_oscillator");
			const cci = getIndicator("cci");

			const row = {
				ticker_id: tickerId,
				forecast: timeframe.forecast,
				direction: timeframe.direction,

				ta_buy: timeframe.ta.buy,
				ta_sell: timeframe.ta.sell,
				ta_neutral: timeframe.ta.neutral,

				ma_buy: timeframe.ma.buy,
				ma_sell: timeframe.ma.sell,
				ma_neutral: timeframe.ma.neutral,

				macd_value: macd?.value ? parseFloat(macd.value) : null,
				macd_forecast: macd?.forecast || null,

				momentum_value: momentum?.value ? parseFloat(momentum.value) : null,
				momentum_forecast: momentum?.forecast || null,

				ao_value: ao?.value ? parseFloat(ao.value) : null,
				ao_forecast: ao?.forecast || null,

				cci_value: cci?.value ? parseFloat(cci.value) : null,
				cci_forecast: cci?.forecast || null,

				ingested_at: timestamp,
			};

			await clickhouse.insert({
				table: "traders_union_analysis",
				values: [row],
				format: "JSONEachRow",
			});

			logger.info({ tickerId }, "Stored Traders Union analysis data");
			return { stored: true };
		} catch (err) {
			logger.error({ err }, "Failed to store Traders Union analysis data");
			return null;
		}
	}
}
