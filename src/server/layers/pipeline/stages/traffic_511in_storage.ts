import { createHash } from "node:crypto";
import type { TrafficEvent511In } from "@/server/adapters/traffic_511in";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface TrafficBatch {
	type: string;
	timestamp: number;
	events: TrafficEvent511In[];
}

export class Traffic511InStorageStage extends PipelineStage<
	TrafficBatch,
	{ stored: number }
> {
	id = "traffic-511in-storage";
	description = "Stores Indiana 511 Traffic events to ClickHouse";
	inputs = ["traffic-511in-source"];
	output = "traffic-511in-stored";

	public async process(
		data: TrafficBatch,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "traffic-511in-source") return null;

		if (!data.events || data.events.length === 0) return { stored: 0 };

		const rows = data.events.map((evt) => {
			// Extract width limit if present
			const widthLimit =
				evt.quantities?.find((q) => q.label === "Width Limit")?.value || "";

			// Create a deterministic ID based on content to prevent duplicates
			// We combine description, route, and start time
			const contentString = `${evt.description || ""}|${evt.location?.routeDesignator || ""}|${evt.beginTime.timestamp}`;
			const hashId = createHash("md5").update(contentString).digest("hex");

			return {
				id: hashId,
				title: evt.title,
				headline: evt.headlinePhrase || "",
				description: evt.description || "",
				route: evt.location?.routeDesignator || "",
				width_limit: widthLimit,
				begin_time: Math.floor(evt.beginTime.timestamp / 1000), // JS ms to unix sec
				updated_time: evt.lastUpdated
					? Math.floor(evt.lastUpdated.timestamp / 1000)
					: 0,
			};
		});

		await clickhouse.insert({
			table: "traffic_events_511in",
			values: rows,
			format: "JSONEachRow",
		});

		return { stored: rows.length };
	}
}
