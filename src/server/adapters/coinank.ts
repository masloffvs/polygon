import { z } from "zod";
import { BaseAdapter } from "./base";

export const CoinankLongShortItemSchema = z.object({
	baseCoin: z.string(),
	exchangeName: z.string(),
	interval: z.string().nullable().optional(),
	sellTradeTurnover: z.number(),
	buyTradeTurnover: z.number(),
	longRatio: z.number().nullable(),
	shortRatio: z.number().nullable(),
});

export const CoinankResponseSchema = z.object({
	success: z.boolean(),
	code: z.string(),
	msg: z.string().nullable().optional(),
	data: z.array(CoinankLongShortItemSchema),
});

export type CoinankResponse = z.infer<typeof CoinankResponseSchema>;

export class CoinankAdapter extends BaseAdapter<CoinankResponse> {
	name = "coinank-adapter";
	description = "Validates Coinank Long/Short Ratio API response";
	schema = CoinankResponseSchema;
}
