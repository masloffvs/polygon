import type { AggregatorLayer } from "../layers/aggregator";
import type { CurrentFearGreedIndex } from "../layers/pipeline/stages/fear_greed_current";
import { ObservableCard } from "./base";

export class FearGreedCard extends ObservableCard<
	CurrentFearGreedIndex,
	CurrentFearGreedIndex | null
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "fear-greed-card",
				title: "Fear & Greed Index",
				description: "Market sentiment analysis",
				type: "stat",
				inputs: ["fear-greed-current"],
			},
			null,
			aggregator,
		);
	}

	public process(data: CurrentFearGreedIndex, topic: string): void {
		if (topic !== "fear-greed-current") return;
		this.snapshot = data;
	}
}
