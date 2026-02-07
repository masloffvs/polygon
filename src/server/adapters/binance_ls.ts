import { z } from "zod";

export const BinanceLongShortSchema = z.object({
	code: z.string(),
	message: z.null().or(z.string()),
	data: z.object({
		xAxis: z.array(z.number()),
		series: z.array(
			z.object({
				name: z.string(),
				data: z.array(z.union([z.number(), z.string()])),
			}),
		),
	}),
	success: z.boolean(),
});

export type BinanceLongShortResponse = z.infer<typeof BinanceLongShortSchema>;
