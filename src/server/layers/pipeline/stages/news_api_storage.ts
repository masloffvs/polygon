import crypto from "node:crypto";
import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

interface NewsApiArticle {
	source: {
		id: string | null;
		name: string;
	};
	author: string | null;
	title: string;
	description: string | null;
	url: string;
	urlToImage: string | null;
	publishedAt: string;
	content: string | null;
}

interface NewsApiBatch {
	type: "news_api_batch";
	articles: NewsApiArticle[];
	fetchedAt: number;
}

export class NewsApiStorageStage extends PipelineStage<
	NewsApiBatch,
	{ stored: number }
> {
	id = "news-api-storage";
	description = "Stores NewsAPI articles to ClickHouse";
	inputs = ["news-api-source"];
	output = "news-api-stored";

	public async process(
		batch: NewsApiBatch,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "news-api-source") return null;
		if (batch.type !== "news_api_batch") return null;

		const articles = batch.articles;
		if (!articles || !Array.isArray(articles) || articles.length === 0) {
			return null;
		}

		try {
			const rows = articles.map((article) => {
				// Create a unique ID based on URL
				const idHash = crypto
					.createHash("md5")
					.update(article.url || article.title)
					.digest("hex");

				return {
					id: idHash,
					source_id: article.source?.id || null,
					source_name: article.source?.name || "Unknown",
					author: article.author || null,
					title: article.title,
					description: article.description || null,
					url: article.url,
					image_url: article.urlToImage || null,
					published_at: Math.floor(
						new Date(article.publishedAt).getTime() / 1000,
					), // DateTime
					content: article.content || null,
					ingested_at: Math.floor(Date.now() / 1000),
				};
			});

			// Using JSONEachRow format
			await clickhouse.insert({
				table: "news_api_articles",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info({ count: rows.length }, "Stored NewsAPI articles");

			return { stored: rows.length };
		} catch (err) {
			logger.error({ err }, "Failed to store NewsAPI articles");
			return null;
		}
	}
}
