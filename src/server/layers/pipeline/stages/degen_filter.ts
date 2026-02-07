import type { RealtimeEvent } from "@/server/integrations/polymarket/realtime-client";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface DegenFilterConfig {
	/** Maximum price considered (default 0.20) */
	priceFilter: number;
}

export class DegenFilterStage extends PipelineStage<
	RealtimeEvent,
	RealtimeEvent
> {
	id = "degen-filter";
	description = "Filters for cheap bets (Price < 0.20)";
	inputs = ["polyscan-ws-source"];
	output = "degen-candidates";

	private maxPrice = 0.2;

	constructor(config?: DegenFilterConfig) {
		super();
		if (config?.priceFilter) {
			this.maxPrice = config.priceFilter;
		}
	}

	public async process(
		event: RealtimeEvent,
		context: ProcessingContext,
	): Promise<RealtimeEvent | null> {
		if (context.topic !== "polyscan-ws-source") return null;

		// We only care about trades for now (whaleTrade or normal trade)
		const trade = event.whaleTrade || event.trade;

		if (!trade) return null;

		if (trade.price < this.maxPrice) {
			// Pass through
			return event;
		}

		return null;
	}
}
