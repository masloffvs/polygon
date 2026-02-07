import { z } from "zod";

const safeNumber = z.preprocess((val) => {
	if (val === null || val === undefined) return null;
	if (typeof val === "string") {
		if (val.trim() === "") return null;
		const num = Number(val);
		return Number.isNaN(num) ? null : num;
	}
	return val;
}, z.number().nullable());

const SparklinePointSchema = z.object({
	place_id: z.string(),
	current_popularity: safeNumber.optional(),
	recorded_at: z.string(),
});

const _PopularTimeSchema = z.object({
	hour: z.number(),
	popularity: z.number(),
});

const PlaceDataSchema = z.object({
	place_id: z.string(),
	name: z.string(),
	address: z.string(),
	// Allow string input for numbers (API sometimes returns strings)
	current_popularity: safeNumber.optional(),
	percentage_of_usual: safeNumber.optional(),
	is_spike: z.boolean().optional(),
	spike_magnitude: safeNumber.optional(),
	data_source: z.string().optional(),
	recorded_at: z.string(),
	data_freshness: z.string().optional(),
	sparkline_24h: z.array(SparklinePointSchema).optional(),
	is_closed_now: z.boolean().optional(),
});

// The user provided schema suggests partial objects might exist, but we should be robust
// The root object
export const PizzaIndexSchema = z.object({
	success: z.boolean(),
	data: z.array(PlaceDataSchema),
	events: z.array(z.any()).optional(),
	overall_index: z.number().optional(),
	defcon_level: z.number().optional(),
	active_spikes: z.number().optional(),
	has_active_spikes: z.boolean().optional(),
	timestamp: z.string().optional(),
	method: z.string().optional(),
	data_freshness: z.string().optional(),
});

export type PizzaIndexResponse = z.infer<typeof PizzaIndexSchema>;
export type PizzaPlaceData = z.infer<typeof PlaceDataSchema>;
