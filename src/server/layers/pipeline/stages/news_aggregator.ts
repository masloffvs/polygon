import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface AggregatedNewsItem {
	id: string;
	source: string;
	title: string;
	summary: string;
	url?: string;
	image_url?: string;
	timestamp: string;
	relevance_score?: number;
}

export class NewsAggregatorStage extends PipelineStage<
	any,
	AggregatedNewsItem[]
> {
	id = "news-aggrigated-all";
	description =
		"Aggregates all news sources into a unified structure for Agent consumption";
	inputs = [
		"news-api-source",
		"pizzint-source",
		"rekt-news-source",
		"us-inflation-source",
		"pizza-index-source",
	];
	output = "news-aggrigated-stream";

	public async process(
		data: any,
		context: ProcessingContext,
	): Promise<AggregatedNewsItem[] | null> {
		const topic = context.topic;
		const items: AggregatedNewsItem[] = [];

		try {
			if (topic === "news-api-source") {
				if (data.type === "news_api_batch" && Array.isArray(data.articles)) {
					data.articles.forEach((article: any) => {
						const date = article.publishedAt || new Date().toISOString();
						items.push({
							id: `newsapi-${article.url || article.title}`,
							source: "news-api",
							title: article.title,
							summary: article.description || article.content || "",
							url: article.url,
							image_url: article.urlToImage,
							timestamp: date,
						});
					});
				}
			} else if (topic === "pizzint-source") {
				if (data.tweets && Array.isArray(data.tweets)) {
					data.tweets.forEach((tweet: any) => {
						items.push({
							id: `pizzint-${tweet.id}`,
							source: "pizzint-osint",
							title: `Tweet from @${tweet.handle}`,
							summary: tweet.text,
							url: tweet.url,
							timestamp: tweet.timestamp,
						});
					});
				}
			} else if (topic === "rekt-news-source") {
				const leaderboard = data.pageProps?.leaderboard;
				if (Array.isArray(leaderboard)) {
					leaderboard.slice(0, 5).forEach((item: any) => {
						items.push({
							id: `rekt-${item.slug}`,
							source: "rekt-news",
							title: item.title,
							summary: `Amount Lost: $${item.rekt.amount}. ${item.excerpt}`,
							url: `https://rekt.news/leaderboard/${item.slug}`,
							image_url: item.banner,
							timestamp: item.date,
						});
					});
				}
			} else if (topic === "us-inflation-source") {
				if (
					data.type === "us_inflation_batch" &&
					Array.isArray(data.dataList)
				) {
					data.dataList.forEach((evt: any) => {
						items.push({
							id: `inflation-${evt.date}`,
							source: "us-inflation",
							title: "US Inflation Event",
							summary: `Date: ${evt.date}, CPI: ${evt.cpi}, CPI YoY: ${evt.cpi_yoy}`,
							timestamp: new Date(evt.date).toISOString(),
						});
					});
				}
			} else if (topic === "pizza-index-source") {
				if (data.success && Array.isArray(data.data)) {
					data.data.forEach((place: any) => {
						if (place.is_spike) {
							items.push({
								id: `pizza-${place.place_id}-${place.recorded_at}`,
								source: "pizza-index",
								title: `High Activity at ${place.name}`,
								summary: `Current popularity: ${place.current_popularity} (${place.percentage_of_usual}% of usual). Address: ${place.address}`,
								timestamp: place.recorded_at,
							});
						}
					});
				}
			}
		} catch (err) {
			logger.error({ err, topic }, "Error aggregation news");
		}

		if (items.length === 0) return null;

		logger.info(
			{ stage: this.id, count: items.length, topic },
			"Aggregated news items",
		);
		return items;
	}
}
