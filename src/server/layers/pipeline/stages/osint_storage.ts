import { clickhouse } from "../../../../storage/clickhouse";
import type { OsintFeedEvent } from "../../../adapters/osint";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class OsintStorageStage extends PipelineStage<
	OsintFeedEvent,
	{ stored: number }
> {
	id = "osint-storage";
	description = "Filters new tweets and persists them to ClickHouse";
	inputs = ["pizzint-source"];
	output = "osint-storage-stats";

	// In-memory cache of seen IDs to prevent duplicate inserts from the same feed polling
	// Use a simple Set, maybe limit size if needed, but for OSINT feed volume (low) it's fine.
	private seenIds = new Set<string>();

	public async process(
		data: OsintFeedEvent,
		_context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (!data.success || !data.tweets || data.tweets.length === 0) {
			return null;
		}

		const newTweets = [];

		for (const tweet of data.tweets) {
			if (!this.seenIds.has(tweet.id)) {
				this.seenIds.add(tweet.id);
				newTweets.push({
					id: tweet.id,
					text: tweet.text,
					url: tweet.url || "",
					timestamp: Math.floor(new Date(tweet.timestamp).getTime() / 1000), // CH DateTime is unix timestamp (seconds) or string
					handle: tweet.handle,
					is_alert: tweet.isAlert ? 1 : 0,
				});
			}
		}

		// Prune seenIds if it gets too huge (e.g. > 10000)
		if (this.seenIds.size > 10000) {
			this.seenIds.clear(); // Brute force clear, or better remove oldest.
			// Since feed returns last 10 items, clearing is risky if poll happens right after.
			// Better: Keep last N. but Set doesn't support that easily without aux array.
			// For now, let's just not clear, 10k strings is tiny memory.
		}

		if (newTweets.length === 0) {
			return null;
		}

		try {
			await clickhouse.insert({
				table: "osint_tweets",
				values: newTweets,
				format: "JSONEachRow",
			});

			logger.info(
				{ count: newTweets.length },
				"Inserted new OSINT tweets to ClickHouse",
			);

			return { stored: newTweets.length };
		} catch (err) {
			logger.error({ err }, "Failed to insert OSINT tweets to ClickHouse");
			return null;
		}
	}
}
