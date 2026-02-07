import type { WsdotTrafficEvent } from "../adapters/wsdot";
import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

interface WsdotCardState {
	events: WsdotTrafficEvent[];
	lastUpdate: number;
}

export class WsdotCard extends ObservableCard<
	WsdotTrafficEvent[],
	WsdotCardState
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "wsdot-card",
				title: "WSDOT Traffic",
				description: "Washington State Road Alerts",
				type: "list",
				inputs: ["wsdot-active"],
			},
			{
				events: [],
				lastUpdate: 0,
			},
			aggregator,
		);
	}

	public process(data: WsdotTrafficEvent[], topic: string): void {
		if (topic !== "wsdot-active") return;

		this.snapshot = {
			events: data,
			lastUpdate: Date.now(),
		};
	}
}
