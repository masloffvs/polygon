import { clickhouse } from "@/storage/clickhouse";
import type { RektNewsResponse } from "../../../adapters/rekt_news";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class RektNewsStorageStage extends PipelineStage<RektNewsResponse, any> {
	id = "rekt-news-storage";
	description = "Stores Rekt News Leaderboard data to ClickHouse";
	inputs = ["rekt-news-source"];
	output = "rekt-news-stored";

	public async process(
		data: RektNewsResponse,
		context: ProcessingContext,
	): Promise<any | null> {
		if (context.topic !== "rekt-news-source") return null;

		const items = data.pageProps.leaderboard;
		if (!items || items.length === 0) return null;

		try {
			const rows = items.map((item) => ({
				slug: item.slug,
				title: item.title,
				date: item.date,
				amount: item.rekt.amount, // Loss Amount
				audit_status: item.rekt.audit,
				incident_date: item.rekt.date,
				tags: item.tags,
				excerpt: item.excerpt,
				banner_url: item.banner || "",
				ingested_at: Math.floor(Date.now() / 1000), // Unix timestamp
			}));

			// Insert into ClickHouse
			await clickhouse.insert({
				table: "rekt_news_events",
				values: rows,
				format: "JSONEachRow",
			});

			return { stored: rows.length, latest: rows[0].slug };
		} catch (err) {
			logger.error({ err }, "Failed to insert Rekt News events to ClickHouse");
			return null;
		}
	}
}
