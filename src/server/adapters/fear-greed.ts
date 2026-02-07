import { z } from "zod";
import { BaseAdapter } from "./base";

/**
 * CoinMarketCap Fear & Greed Index API Response
 * https://api.coinmarketcap.com/data-api/v3/fear-greed/chart
 *
 * Response example:
 * {
 *   "data": {
 *     "dataList": [
 *       {
 *         "score": 59,
 *         "name": "Neutral",
 *         "timestamp": "1687996800",
 *         "btcPrice": "30086.19",
 *         "btcVolume": "13180860821.04"
 *       }
 *     ]
 *   },
 *   "status": { "timestamp": "...", "error_code": "0", "error_message": "SUCCESS" }
 * }
 */

export const FearGreedEntrySchema = z.object({
	score: z.number().min(0).max(100),
	name: z.enum(["Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"]),
	timestamp: z.string(), // Unix timestamp as string
	btcPrice: z.string(),
	btcVolume: z.string(),
});

export const FearGreedResponseSchema = z.object({
	data: z.object({
		dataList: z.array(FearGreedEntrySchema),
	}),
	status: z
		.object({
			timestamp: z.string().optional(),
			error_code: z.string().optional(),
			error_message: z.string().optional(),
		})
		.optional(),
});

export type FearGreedEntry = z.infer<typeof FearGreedEntrySchema>;
export type FearGreedResponse = z.infer<typeof FearGreedResponseSchema>;

export class FearGreedAdapter extends BaseAdapter<FearGreedResponse> {
	name = "fear-greed-adapter";
	description = "Validates CoinMarketCap Fear & Greed Index API response";
	schema = FearGreedResponseSchema;
}

/**
 * Helper to get sentiment category from score
 */
export function getSentimentFromScore(score: number): string {
	if (score <= 24) return "Extreme Fear";
	if (score <= 44) return "Fear";
	if (score <= 55) return "Neutral";
	if (score <= 74) return "Greed";
	return "Extreme Greed";
}
