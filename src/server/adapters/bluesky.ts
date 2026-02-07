import { z } from "zod";
import { BaseAdapter } from "./base";

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------

const BlueSkyAuthorSchema = z.object({
	did: z.string(),
	handle: z.string(),
	displayName: z.string().optional(),
	avatar: z.string().optional(),
	createdAt: z.string().optional(),
});

const BlueSkyPostRecordSchema = z.object({
	$type: z.string().optional(),
	createdAt: z.string(),
	text: z.string(),
	langs: z.array(z.string()).optional(),
});

const BlueSkyPostSchema = z.object({
	uri: z.string(),
	cid: z.string(),
	author: BlueSkyAuthorSchema,
	record: BlueSkyPostRecordSchema,
	replyCount: z.number().optional(),
	repostCount: z.number().optional(),
	likeCount: z.number().optional(),
	indexedAt: z.string(),
});

const BlueSkyFeedItemSchema = z.object({
	post: BlueSkyPostSchema,
	reason: z.any().optional(), // For reposts etc
});

const BlueSkyTopicSchema = z.object({
	topic: z.string(),
	displayName: z.string().optional(),
	link: z.string(),
});

// Event Types
export const BlueSkyFeedEventSchema = z.object({
	type: z.literal("feed"),
	feed: z.array(BlueSkyFeedItemSchema),
	timestamp: z.number(),
});

export const BlueSkyTrendingEventSchema = z.object({
	type: z.literal("trending"),
	topics: z.array(BlueSkyTopicSchema),
	suggested: z.array(BlueSkyTopicSchema).optional(),
	timestamp: z.number(),
});

export const BlueSkyEventSchema = z.union([
	BlueSkyFeedEventSchema,
	BlueSkyTrendingEventSchema,
]);

export type BlueSkyEvent = z.infer<typeof BlueSkyEventSchema>;

// ------------------------------------------------------------------
// Adapter
// ------------------------------------------------------------------

export class BlueSkyAdapter extends BaseAdapter<BlueSkyEvent> {
	name = "bluesky-adapter";
	description = "Validates BlueSky feed and trending topics events";
	schema = BlueSkyEventSchema;
}
