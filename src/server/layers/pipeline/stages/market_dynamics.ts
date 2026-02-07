import type { Liquidation } from "../../sources/liquidations";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { AggregatedLongShort } from "./binance_ls_aggregation";

export interface MarketDynamicsUpdate {
	type: "liquidation_enriched";
	liquidation: Liquidation;
	marketContext?: {
		longShortRatio?: number;
		longAccount?: number;
		shortAccount?: number;
	};
}

export class MarketDynamicsStage extends PipelineStage<
	Liquidation | AggregatedLongShort,
	MarketDynamicsUpdate
> {
	id = "market-dynamics";
	description = "Enriches liquidations with market sentiment (L/S ratios)";
	inputs = ["liquidations-source", "binance-ls-aggregated"];
	output = "market-dynamics";

	private lsCache: AggregatedLongShort = {};

	public async process(
		data: Liquidation | AggregatedLongShort,
		context: ProcessingContext,
	): Promise<MarketDynamicsUpdate | null> {
		if (context.topic === "binance-ls-aggregated") {
			this.lsCache = data as AggregatedLongShort;
			return null;
		}

		if (context.topic === "liquidations-source") {
			const liq = data as Liquidation;
			const lsKey = `${liq.symbol}USDT`;
			const lsData = this.lsCache[lsKey];

			return {
				type: "liquidation_enriched",
				liquidation: liq,
				marketContext: lsData
					? {
							longShortRatio: lsData.ratio,
							longAccount: lsData.longAccount,
							shortAccount: lsData.shortAccount,
						}
					: undefined,
			};
		}

		return null;
	}
}
