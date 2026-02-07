import type { AggregatorLayer } from "../layers/aggregator";
import type { MarketStatus } from "../layers/pipeline/stages/world_market_status";
import { ObservableCard } from "./base";

interface WorldClockCardState {
	currentMarket: MarketStatus | null;
	allMarkets: MarketStatus[];
}

export class WorldClockCard extends ObservableCard<
	MarketStatus[],
	WorldClockCardState
> {
	private currentIndex = 0;
	private lastSwitchTime = 0;

	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "world-clock-card",
				title: "Global Time",
				description: "Standard time across major financial hubs",
				type: "dict",
				inputs: ["market-status-updates"],
			},
			{
				currentMarket: null,
				allMarkets: [],
			},
			aggregator,
		);
	}

	public process(data: MarketStatus[], _topic: string): void {
		if (!Array.isArray(data) || data.length === 0) return;

		const now = Date.now();

		// Initialize or Cycle
		if (
			this.snapshot.currentMarket === null ||
			now - this.lastSwitchTime > 3000
		) {
			this.currentIndex = (this.currentIndex + 1) % data.length;
			this.lastSwitchTime = now;
		}

		// Always update the data (time changes every second)
		const current = data[this.currentIndex];

		this.snapshot = {
			currentMarket: current,
			allMarkets: data, // Keep full list if needed, but UI mainly uses current
		};
	}
}
