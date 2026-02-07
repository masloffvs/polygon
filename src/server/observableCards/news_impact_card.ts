import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

export class NewsImpactCard extends ObservableCard {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "news-impact-card",
				title: "Political News Impact",
				description: "AI-driven correlation between news and massive markets",
				type: "custom",
				inputs: ["news-impact-analysis"],
			},
			{
				loading: true,
				markets: [],
				timestamp: 0,
			},
			aggregator,
		);
	}

	public process(data: any, topic: string): void {
		if (topic === "news-impact-analysis") {
			this.snapshot = data;
		}
	}
}
