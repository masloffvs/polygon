import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { NewsImpactAnalysisRaw } from "./agents/news_market_influence";

export class NewsImpactStorageStage extends PipelineStage<
	NewsImpactAnalysisRaw,
	{ stored: number }
> {
	id = "news-impact-storage";
	description = "Stores News Impact Analysis data to ClickHouse";
	inputs = ["news-impact-analysis"];
	output = "news-impact-stored";

	public async process(
		data: NewsImpactAnalysisRaw,
		context: ProcessingContext,
	): Promise<{ stored: number } | null> {
		if (context.topic !== "news-impact-analysis") return null;

		if (!data.markets || data.markets.length === 0) return null;

		const values = data.markets.map((m) => ({
			market_id: m.marketId,
			title: m.title,
			ticker: m.ticker,
			volume_24hr: m.volume24hr,
			relevance: m.newsRelevance,
			impact_score: m.impactScore,
			prob: m.prob || 0,
			timestamp: Math.floor(data.timestamp / 1000),
			ingested_at: Math.floor(Date.now() / 1000),
		}));

		try {
			await clickhouse.insert({
				table: "news_market_impact",
				values: values,
				format: "JSONEachRow",
			});

			return { stored: values.length };
		} catch (err) {
			logger.error({ err }, "Failed to store news impact data");
			return null;
		}
	}
}

export async function runNewsImpactMigrations() {
	await clickhouse.exec({
		query: `
        CREATE TABLE IF NOT EXISTS news_market_impact (
            market_id String,
            title String,
            ticker String,
            volume_24hr Float64,
            relevance Float64,
            impact_score Float64,
            prob Float64,
            timestamp DateTime,
            ingested_at DateTime DEFAULT now()
        )
        ENGINE = MergeTree()
        ORDER BY (market_id, timestamp)
        `,
	});
}
