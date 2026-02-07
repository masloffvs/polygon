import type { TrafficEvent511In } from "../adapters/traffic_511in";
import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

interface TrafficCardState {
	events: TrafficEvent511In[];
	lastUpdate: number;
}

export class Traffic511InCard extends ObservableCard<
	TrafficEvent511In[],
	TrafficCardState
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "traffic-511in-card",
				title: "Indiana 511 Traffic",
				description: "Real-time Traffic Incidents & Alerts",
				type: "list",
				inputs: ["traffic-511in-active"],
			},
			{
				events: [],
				lastUpdate: 0,
			},
			aggregator,
		);
	}

	public process(data: TrafficEvent511In[], topic: string): void {
		if (topic !== "traffic-511in-active") return;

		this.snapshot = {
			events: data,
			lastUpdate: Date.now(),
		};
	}
}
