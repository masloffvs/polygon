import { clickhouse } from "@/storage/clickhouse";
import type { BlueSkyEvent } from "../../../adapters/bluesky";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class BlueSkyStorageStage extends PipelineStage<
	BlueSkyEvent,
	{ stored_posts: number; stored_trends: number }
> {
	id = "bluesky-storage";
	description = "Stores BlueSky posts and trends to ClickHouse";
	inputs = ["bluesky-feed-source", "bluesky-trending-source"];
	output = "bluesky-stored";

	public async process(
		data: BlueSkyEvent,
		context: ProcessingContext,
	): Promise<{ stored_posts: number; stored_trends: number } | null> {
		if (
			context.topic !== "bluesky-feed-source" &&
			context.topic !== "bluesky-trending-source"
		) {
			return null;
		}

		if (data.type === "feed") {
			return this.processFeed(data);
		} else if (data.type === "trending") {
			return this.processTrends(data);
		}

		return null;
	}

	private async processFeed(data: BlueSkyEvent & { type: "feed" }) {
		if (!data.feed || data.feed.length === 0) return null;

		try {
			const rows = data.feed.map((item) => {
				const post = item.post;
				return {
					uri: post.uri,
					cid: post.cid,
					author_did: post.author.did,
					author_handle: post.author.handle,
					author_name: post.author.displayName || "",
					content: post.record.text,
					posted_at: new Date(post.record.createdAt)
						.toISOString()
						.replace("T", " ")
						.slice(0, 19),
					reply_count: post.replyCount || 0,
					repost_count: post.repostCount || 0,
					like_count: post.likeCount || 0,
					indexed_at: new Date(post.indexedAt)
						.toISOString()
						.replace("T", " ")
						.slice(0, 19),
					source_feed: (data as any).uri || null, // Store source feed URI if available
				};
			});

			await clickhouse.insert({
				table: "bluesky_posts",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info({ count: rows.length }, "Stored BlueSky posts");
			return { stored_posts: rows.length, stored_trends: 0 };
		} catch (err) {
			logger.error({ err }, "Failed to store BlueSky posts");
			return null;
		}
	}

	private async processTrends(data: BlueSkyEvent & { type: "trending" }) {
		// Collect both main topics and suggested topics
		const allTopics = [...data.topics];
		if (data.suggested) {
			allTopics.push(...data.suggested);
		}

		if (allTopics.length === 0) return null;

		try {
			const timestamp = new Date(data.timestamp)
				.toISOString()
				.replace("T", " ")
				.slice(0, 19);

			const rows = allTopics.map((t, index) => ({
				topic: t.topic,
				display_name: t.displayName || t.topic,
				link: t.link,
				rank: index + 1,
				timestamp: timestamp,
			}));

			await clickhouse.insert({
				table: "bluesky_trends",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info(
				{ count: rows.length },
				"Stored BlueSky trends (including suggested)",
			);
			return { stored_posts: 0, stored_trends: rows.length };
		} catch (err) {
			logger.error({ err }, "Failed to store BlueSky trends");
			return null;
		}
	}
}
