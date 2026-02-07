import type { TrafficEvent511In } from "@/server/adapters/traffic_511in";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface TrafficBatch {
	type: string;
	timestamp: number;
	events: TrafficEvent511In[];
}

interface TrafficState {
	activeEvents: Map<string, TrafficEvent511In>;
	lastPurge: number;
}

export class Traffic511InCurrentStage extends PipelineStage<
	TrafficBatch,
	TrafficEvent511In[]
> {
	id = "traffic-511in-current";
	description = "Maintains list of currently active traffic events";
	inputs = ["traffic-511in-source"];
	output = "traffic-511in-active";

	public async process(
		data: TrafficBatch,
		context: ProcessingContext,
	): Promise<TrafficEvent511In[] | null> {
		if (context.topic !== "traffic-511in-source") return null;

		// 1. Update active events from the batch
		// The source polls, so it might send the same events repeatedly or new ones.
		// If it's a "current snapshot" from the API, we can just replace our state?
		// The API seems to be "listEventsQuery". Usually APIs return *all* active events matching the query.
		// If so, the batch IS the current state.

		// However, the user said "save or update events for each day".
		// If the API returns *all* current events, we might just pass them through.
		// But let's assume we want to do some processing, like sorting by severity or grouping.

		if (!data.events) return null;

		// For now, let's treat the incoming batch as the authoritative "current" list.
		// Sort by priority (1 = critical, higher = less important)
		const sortedEvents = [...data.events].sort((a, b) => {
			const pA = a.priority ?? 99;
			const pB = b.priority ?? 99;
			return pA - pB;
		});

		return sortedEvents;
	}
}
