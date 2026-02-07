import type { WsdotTrafficEvent } from "@/server/adapters/wsdot";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface WsdotBatch {
	type: string;
	timestamp: number;
	events: WsdotTrafficEvent[];
}

export class WsdotCurrentStage extends PipelineStage<
	WsdotBatch,
	WsdotTrafficEvent[]
> {
	id = "wsdot-current";
	description = "Maintains list of currently active WSDOT events";
	inputs = ["wsdot-source"];
	output = "wsdot-active";

	public async process(
		data: WsdotBatch,
		context: ProcessingContext,
	): Promise<WsdotTrafficEvent[] | null> {
		if (context.topic !== "wsdot-source") return null;
		if (!data.events) return null;

		// Sort by priority (lower = more important)
		const sortedEvents = [...data.events].sort((a, b) => {
			return a.priority - b.priority;
		});

		return sortedEvents;
	}
}
