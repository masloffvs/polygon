import { z } from "zod";
import { BaseAdapter } from "./base";

const TradingViewDataPoint = z.object({
	s: z.string(), // Symbol e.g. "CRYPTO:BTCUSD"
	d: z.array(z.any()), // Array of mixed values corresponding to requested columns
});

export const TradingViewTechSchema = z
	.object({
		totalCount: z.number(),
		data: z.array(TradingViewDataPoint),
	})
	.passthrough();

export type TradingViewTechEvent = z.infer<typeof TradingViewTechSchema>;

export class TradingViewTechAdapter extends BaseAdapter<TradingViewTechEvent> {
	name = "tradingview-tech-adapter";
	description = "Validates TradingView Tech Analysis Screener Data";
	schema = TradingViewTechSchema;
}
