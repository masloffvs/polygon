import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface AggregatedLongShort {
	[symbol: string]: {
		timestamp: number;
		ratio: number;
		longAccount: number;
		shortAccount: number;
	};
}

export class BinanceLongShortAggregationStage extends PipelineStage<
	any,
	AggregatedLongShort
> {
	id = "binance-ls-aggregation";
	description = "Aggregates Long/Short Ratios from multiple sources";
	// These inputs will be dynamically matched or explicitly listed.
	// We'll set them in constructor or rely on naming convention if possible,
	// but PipelineStage expects explicit array. We will handle dynamic accumulation.
	inputs = [
		"binance-ls-solusdt-source",
		"binance-ls-btcusdt-source",
		"binance-ls-ethusdt-source",
		"binance-ls-xrpusdt-source",
	];
	output = "binance-ls-aggregated";

	private buffer: AggregatedLongShort = {};

	public async process(
		data: any,
		_context: ProcessingContext,
	): Promise<AggregatedLongShort | null> {
		// Data shape: { symbol: 'SOLUSDT', timestamp: 123, ratio: 2.1, ... }

		if (data?.symbol) {
			this.buffer[data.symbol] = {
				timestamp: data.timestamp,
				ratio: data.ratio,
				longAccount: data.longAccount,
				shortAccount: data.shortAccount,
			};

			// Return a copy of the full buffer updates
			return { ...this.buffer };
		}

		return null;
	}
}
