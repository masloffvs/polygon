import { z } from "zod";
import { BaseAdapter } from "./base";

// Define sub-schemas for the complex nested structure
const ForecastSchema = z.object({
	forecast: z.string(),
	direction: z.string(),
});

const TASchema = z.object({
	forecast: z.string(),
	direction: z.string(),
	buy: z.number(),
	sell: z.number(),
	neutral: z.number(),
});

const MASchema = z.object({
	forecast: z.string(),
	direction: z.string(),
	buy: z.number(),
	sell: z.number(),
	neutral: z.number(),
});

const TimeframesSchema = z
	.object({
		h1: ForecastSchema.optional(),
		m30: ForecastSchema.optional(),
		m15: ForecastSchema.optional(),
		w1: ForecastSchema.optional(),
		h4: ForecastSchema.optional(),
		d1: ForecastSchema.optional(),
	})
	.passthrough();

const IndicatorSchema = z
	.object({
		type: z.string(), // moving_average, macd, momentum, ichimoku, awesome_oscillator, cci
		forecast: z.string(),
		direction: z.string(),
		value: z.string().optional(), // value is missing for MA type top-level?
		timeframes: TimeframesSchema.optional(),
		values: z.array(z.any()).optional(), // For moving_average list
	})
	.passthrough();

const TimeframeAnalysisSchema = z.object({
	forecast: z.string(),
	direction: z.string(),
	ta: TASchema,
	ma: MASchema,
	indicators: z.array(IndicatorSchema),
});

const TUDataSchema = z
	.object({
		ticker_id: z.number(),
		m5: TimeframeAnalysisSchema.optional(),
		m15: TimeframeAnalysisSchema.optional(),
		h1: TimeframeAnalysisSchema.optional(), // The API might return others too
	})
	.passthrough();

export const TradersUnionResponseSchema = z
	.object({
		status: z.string(),
		code: z.number(),
		data: TUDataSchema,
	})
	.passthrough();

export type TradersUnionEvent = z.infer<typeof TradersUnionResponseSchema>;

export class TradersUnionAdapter extends BaseAdapter<TradersUnionEvent> {
	name = "traders-union-adapter";
	description = "Validates Traders Union Technical Analysis Data";
	schema = TradersUnionResponseSchema;
}
