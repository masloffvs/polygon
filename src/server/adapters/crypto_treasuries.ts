import { z } from "zod";
import { BaseAdapter } from "./base";

export const CryptoTreasurySchema = z.object({
	company_name: z.string(),
	country: z.string(),
	ticker: z.string(),
	coin: z.string(),
	company_type: z.string(),
	holdings: z.number(),
	latest_acquisitions: z.union([z.number(), z.string()]), // can be "--"
	cost_basis: z.union([z.number(), z.string()]), // can be "--"
	data_as_of: z.string(),
	doc: z.string(),
});

export const CryptoTreasuriesResponseSchema = z.array(CryptoTreasurySchema);

export type CryptoTreasury = z.infer<typeof CryptoTreasurySchema>;
export type CryptoTreasuriesResponse = z.infer<
	typeof CryptoTreasuriesResponseSchema
>;

export class CryptoTreasuriesAdapter extends BaseAdapter<CryptoTreasuriesResponse> {
	name = "crypto-treasuries-adapter";
	description = "Validates CoinMarketCap crypto treasuries response";
	schema = CryptoTreasuriesResponseSchema;
}
