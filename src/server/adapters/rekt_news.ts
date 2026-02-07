import { z } from "zod";
import { BaseAdapter } from "./base";

// Rekt News Leaderboard Schema
export const RektNewsItemSchema = z.object({
	date: z.string(),
	featured: z.boolean(),
	title: z.string(),
	rekt: z.object({
		amount: z.number(),
		audit: z.string(),
		date: z.string(),
	}),
	tags: z.array(z.string()),
	excerpt: z.string(),
	banner: z.string().optional(),
	slug: z.string(),
});

export const RektNewsResponseSchema = z.object({
	pageProps: z.object({
		leaderboard: z.array(RektNewsItemSchema),
	}),
});

export type RektNewsResponse = z.infer<typeof RektNewsResponseSchema>;
export type RektNewsItem = z.infer<typeof RektNewsItemSchema>;

export class RektNewsAdapter extends BaseAdapter<RektNewsResponse> {
	name = "rekt-news-adapter";
	description = "Validates Rekt.news leaderboard feed";
	schema = RektNewsResponseSchema;
}
