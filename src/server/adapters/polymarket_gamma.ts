import { z } from "zod";
import { BaseAdapter } from "./base";

export const GammaMarketSchema = z.object({
	id: z.string(),
	question: z.string(),
	slug: z.string(),
	volume: z.string().or(z.number()),
	volume24hr: z.number().optional(),
	liquidity: z.string().or(z.number()),
	outcomePrices: z.string(), // "[\"0.0065\", \"0.9935\"]"
	outcomes: z.string(), // "[\"Yes\", \"No\"]"
	updatedAt: z.string(),
	createdAt: z.string(),
	active: z.boolean(),
	closed: z.boolean(),
});

export const GammaResponseSchema = z.array(GammaMarketSchema);

export type GammaMarket = z.infer<typeof GammaMarketSchema>;
export type GammaResponse = z.infer<typeof GammaResponseSchema>;

export class PolymarketGammaAdapter extends BaseAdapter<GammaResponse> {
	name = "polymarket-gamma-adapter";
	description = "Validates Polymarket Gamma API response";
	schema = GammaResponseSchema;
}
