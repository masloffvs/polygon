import { clickhouse } from "@/storage/clickhouse";
import type { PizzaIndexResponse } from "../../../schemas/pizza_index";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class PizzaMonitorStage extends PipelineStage<
	PizzaIndexResponse,
	{ processed: number }
> {
	id = "pizza-monitor";
	description = "Monitors Pizza Index and updates local database";
	inputs = ["pizza-index-source"];
	output = "pizza-updates";

	public async process(
		data: PizzaIndexResponse,
		context: ProcessingContext,
	): Promise<{ processed: number } | null> {
		if (context.topic !== "pizza-index-source") return null;

		if (!data.success || !data.data) {
			return null;
		}

		// Calculate Washington DC Date
		const washingtonDate = new Date().toLocaleDateString("en-CA", {
			timeZone: "America/New_York",
		}); // returns YYYY-MM-DD

		const rows = data.data.map((place) => {
			return {
				place_id: place.place_id,
				date: washingtonDate,
				name: place.name,
				address: place.address,
				current_popularity: place.current_popularity ?? null,
				percentage_of_usual: place.percentage_of_usual ?? null,
				is_spike: place.is_spike ? 1 : 0,
				spike_magnitude: place.spike_magnitude ?? null,
				data_source: place.data_source || "unknown",
				recorded_at: Math.floor(new Date(place.recorded_at).getTime() / 1000), // DateTime in CH is usually seconds or simple string iso
				data_freshness: place.data_freshness || "",
			};
		});

		if (rows.length === 0) return { processed: 0 };

		try {
			await clickhouse.insert({
				table: "pizza_index_places",
				values: rows,
				format: "JSONEachRow",
			});
			logger.info(
				{ count: rows.length, date: washingtonDate },
				"Updated Pizza Index Places in ClickHouse",
			);
		} catch (err) {
			logger.error({ err }, "Failed to insert Pizza Index data");
		}

		return { processed: rows.length };
	}
}
