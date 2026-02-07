import type { RealtimeEvent } from "@/server/integrations/polymarket/realtime-client";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface DegenEvent extends RealtimeEvent {
	degenType: "micro" | "mid";
}

export class DegenAnalysisStage extends PipelineStage<
	RealtimeEvent,
	DegenEvent
> {
	id = "degen-analysis";
	description = "Filters cheap bets by volume/value rules";
	inputs = ["degen-filter"]; // Input from the previous stage
	output = "degen-events";

	public async process(
		event: RealtimeEvent,
		context: ProcessingContext,
	): Promise<DegenEvent | null> {
		if (context.topic !== "degen-filter") return null;

		const trade = event.whaleTrade || event.trade;
		if (!trade) return null;

		const price = trade.price;
		const value = trade.size * price; // size is usually shares, so value = shares * price

		// Rule 1: Price <= 0.01 && Value >= 15 USD
		if (price <= 0.01 && value >= 15) {
			return { ...event, degenType: "micro" };
		}

		// Rule 2: 0.01 < Price <= 0.10 && Value >= 50 USD
		if (price > 0.01 && price <= 0.1 && value >= 50) {
			return { ...event, degenType: "mid" };
		}

		// Implicit Rule: Anything else (e.g. 0.10 < Price < 0.20 or low value) is dropped
		return null;
	}
}
