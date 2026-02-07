import { z } from "zod";
import { BaseAdapter } from "./base";

export const OsintTweetSchema = z.object({
	id: z.string(),
	text: z.string(),
	url: z.string().optional(),
	timestamp: z.string(),
	handle: z.string(),
	isAlert: z.boolean().optional(),
});

export const OsintFeedSchema = z.object({
	success: z.boolean(),
	tweets: z.array(OsintTweetSchema),
	timestamp: z.string().optional(),
	source: z.string().optional(),
	incremental: z.boolean().optional(),
	sourceCount: z.number().optional(),
});

export type OsintFeedEvent = z.infer<typeof OsintFeedSchema>;

export class OsintAdapter extends BaseAdapter<OsintFeedEvent> {
	name = "osint-adapter";
	description = "Validates OSINT Feed Data";
	schema = OsintFeedSchema;
}
