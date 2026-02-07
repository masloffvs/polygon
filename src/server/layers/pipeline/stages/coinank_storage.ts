import type { CoinankResponse } from "@/server/adapters/coinank";
import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class CoinankStorageStage extends PipelineStage<
	CoinankResponse,
	{ stored: number }
> {
	id = "coinank-storage";
	description = "Stores Coinank Long/Short Ratio data to ClickHouse";
	inputs = [
		"coinank-btc-source",
		"coinank-eth-source",
		"coinank-xrp-source",
		"coinank-sol-source",
	];
	output = "coinank-stored";

	public async process(
		data: CoinankResponse,
		_context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (!data.success || !data.data || data.data.length === 0) {
			return null;
		}

		const timestamp = Date.now();
		const rows = data.data.map((item) => ({
			base_coin: item.baseCoin,
			exchange: item.exchangeName,
			long_ratio: item.longRatio || 0,
			short_ratio: item.shortRatio || 0,
			buy_volume: item.buyTradeTurnover,
			sell_volume: item.sellTradeTurnover,
			timestamp: Math.floor(timestamp / 1000), // ClickHouse DateTime is seconds typically, or DateTime64 for ms
		}));

		try {
			await clickhouse.insert({
				table: "coinank_long_short",
				values: rows,
				format: "JSONEachRow",
			});
			return { stored: rows.length };
		} catch (err) {
			logger.error({ err, rows: rows.length }, "Failed to insert Coinank data");
			return null;
		}
	}
}
