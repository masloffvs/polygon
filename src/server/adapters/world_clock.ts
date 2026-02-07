import { z } from "zod";
import { BaseAdapter } from "./base";

export const WorldClockSchema = z.object({
	timestamp: z.number(),
	cities: z.record(z.string(), z.string()), // City Name -> ISO/Formatted Time string
});

export type WorldClockEvent = z.infer<typeof WorldClockSchema>;

export class WorldClockAdapter extends BaseAdapter<WorldClockEvent> {
	name = "world-clock-adapter";
	description = "Validates World Clock ticks";
	schema = WorldClockSchema;
}
