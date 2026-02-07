import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

// Inputs
// 1. aggregated Long/Short
// 2. tradingview-tech-source (Array of TechAnalysis)
// 3. traders-union-source (Array of predictions)
// 4. fear-greed-source (FearGreedIndex)

export interface MarketSentimentPacket {
	timestamp: number;
	binanceLS: Record<string, any>;
	technicalAnalysis: Record<string, any>;
	tradersUnion: any[];
	fearAndGreed: any;
}

export class MarketSentimentStage extends PipelineStage<
	any,
	MarketSentimentPacket
> {
	id = "market-sentiment-stage";
	description = "Unifies all market sentiment indicators";
	inputs = [
		"binance-ls-aggregated",
		"tradingview-tech-source",
		"traders-union-source",
		"fear-greed-source",
	];
	output = "market-sentiment-snapshot";

	private state: MarketSentimentPacket = {
		timestamp: Date.now(),
		binanceLS: {},
		technicalAnalysis: {},
		tradersUnion: [],
		fearAndGreed: null,
	};

	public async process(
		data: any,
		context: ProcessingContext,
	): Promise<MarketSentimentPacket | null> {
		const topic = context.topic;
		let updated = false;

		if (topic === "binance-ls-aggregated") {
			this.state.binanceLS = data;
			updated = true;
		} else if (topic === "tradingview-tech-source") {
			// Transform array to map by symbol
			const map: Record<string, any> = {};
			if (data.data && Array.isArray(data.data)) {
				data.data.forEach((item: any) => {
					// item.s usually "BINANCE:BTCUSDT" or "BTCUSDT"
					map[item.s.replace("BINANCE:", "")] = item.d;
				});
			}
			this.state.technicalAnalysis = map;
			updated = true;
		} else if (topic === "traders-union-source") {
			// raw array
			this.state.tradersUnion = data;
			updated = true;
		} else if (topic === "fear-greed-source") {
			this.state.fearAndGreed = data;
			updated = true;
		}

		if (updated) {
			this.state.timestamp = Date.now();
			return { ...this.state };
		}

		return null; // No state change relevant to downstream?
		// Actually, for pipeline stages, we usually return the state if updated.
	}
}
