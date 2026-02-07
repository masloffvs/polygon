import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

interface MarketSnapshot {
	[exchange: string]: {
		[symbol: string]: number;
	};
}

export class MarketSnapshotCard extends ObservableCard<
	MarketSnapshot,
	MarketSnapshot
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "market-snapshot-card",
				title: "Market Snapshot",
				description: "Real-time cross-exchange price matrix",
				type: "dict",
				inputs: ["market-snapshot"],
			},
			{}, // Initial Empty State
			aggregator,
		);
	}

	public process(data: MarketSnapshot, _topic: string): void {
		// Merge updates into state
		// The data coming in is the full snapshot or partial?
		// In global_snapshot.ts we emit: return JSON.parse(JSON.stringify(this.snapshot));
		// So it's the full cumulative snapshot. We can just replace/merge.

		// Using deep merge or just replacement since logic handles accumulation
		this.snapshot = {
			...this.snapshot,
			...data,
		};
	}
}
