import { z } from "zod";
import { BaseAdapter } from "./base";

export const CryptoLeaderSchema = z.object({
	rank: z.union([z.string(), z.number()]).transform((val) => String(val)),
	proxyWallet: z.string(),
	userName: z.string().nullable().optional(),
	xUsername: z.string().nullable().optional(),
	verifiedBadge: z.boolean().optional(),
	vol: z.number().optional(),
	pnl: z.number().optional(),
	profileImage: z.string().nullable().optional(),
});

export const CryptoLeadersResponseSchema = z.array(CryptoLeaderSchema);

export const CryptoLeadersBatchSchema = z.object({
	type: z.literal("crypto_leaders_batch"),
	leaders: CryptoLeadersResponseSchema,
	fetchedAt: z.number(),
});

export type CryptoLeader = z.infer<typeof CryptoLeaderSchema>;
export type CryptoLeadersResponse = z.infer<typeof CryptoLeadersResponseSchema>;
export type CryptoLeadersBatch = z.infer<typeof CryptoLeadersBatchSchema>;

export class PolymarketCryptoLeadersAdapter extends BaseAdapter<CryptoLeadersBatch> {
	name = "polymarket-crypto-leaders-adapter";
	description = "Validates Polymarket crypto leaderboard response batch";
	schema = CryptoLeadersBatchSchema;
}
