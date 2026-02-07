import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

interface PennyWhaleTrade {
	transactionHash: string;
	title: string;
	outcome: string;
	side: "BUY" | "SELL";
	price: number;
	size: number;
	computedValue: number;
	timestamp: number;
}

interface PennyWhaleCardState {
	recentTrades: PennyWhaleTrade[];
	lastUpdate: number;
}

export class PennyWhaleCard extends ObservableCard<
	PennyWhaleTrade,
	PennyWhaleCardState
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "penny-whale-card",
				title: "Penny Whales",
				description: "Large trades ($20k+) at low prices (<20¢)",
				type: "list",
				inputs: ["polymarket-penny-whales"],
			},
			{
				recentTrades: [],
				lastUpdate: Date.now(),
			},
			aggregator,
		);
	}

	public process(data: PennyWhaleTrade, _topic: string): void {
		if (!data || !data.transactionHash) return;

		this.snapshot.recentTrades.unshift(data);

		// Keep last 30
		if (this.snapshot.recentTrades.length > 30) {
			this.snapshot.recentTrades.pop();
		}

		this.snapshot.lastUpdate = Date.now();
	}
}
