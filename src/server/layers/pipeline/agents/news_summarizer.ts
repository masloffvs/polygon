import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { logger } from "../../../utils/logger";
import { type AgentConfig, PipelineAgent } from "../agent";
import type { AggregatedNewsItem } from "../stages/news_aggregator";
import type { ProcessingContext } from "../types";

interface NewsSummaryOutput {
	summary: string;
	highlights: string[];
	timestamp: number;
}

export class NewsSummarizerAgent extends PipelineAgent<
	AggregatedNewsItem[],
	NewsSummaryOutput
> {
	id = "news-summarizer-agent";
	description = "Summarizes aggregated news using OpenRouter LLM";
	inputs = ["news-aggrigated-stream"];
	output = "news-summary-updates";

	agentConfig: AgentConfig = {
		provider: "openrouter",
		model: "xiaomi/mimo-v2-flash", // Use preferred model
		systemPrompt:
			"You are a crypto and financial news analyst. Summarize the provided news items into a concise briefing. Highlight major market moving events.",
	};

	private recentNews: AggregatedNewsItem[] = [];
	private readonly MAX_HISTORY = 30;

	// OpenRouter Config
	private readonly OPENROUTER_API_KEY: string = this.validateApiKey();

	private validateApiKey(): string {
		const apiKey = process.env.OPENROUTER_API_KEY;
		if (!apiKey) {
			console.log("Environment", process.env);
			throw new Error("OPENROUTER_API_KEY environment variable is not set");
		}
		return apiKey;
	}

	private openrouter: ReturnType<typeof createOpenRouter>;

	constructor() {
		super();
		this.openrouter = createOpenRouter({
			apiKey: this.OPENROUTER_API_KEY,
			headers: {
				"HTTP-Referer": "https://polygon-bot.com",
				"X-Title": "Polygon Bot",
			},
		});
	}

	public async process(
		data: AggregatedNewsItem[],
		_context: ProcessingContext,
	): Promise<NewsSummaryOutput | null> {
		if (!data || data.length === 0) return null;

		// 1. Add new items to history (deduplicate by ID)
		const existingIds = new Set(this.recentNews.map((i) => i.id));
		for (const item of data) {
			if (!existingIds.has(item.id)) {
				this.recentNews.push(item);
				existingIds.add(item.id);
			}
		}

		// 2. Trim history
		// Sort by timestamp desc
		this.recentNews.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		);
		if (this.recentNews.length > this.MAX_HISTORY) {
			this.recentNews = this.recentNews.slice(0, this.MAX_HISTORY);
		}

		// 3. Call LLM
		try {
			const summary = await this.callOpenRouter(this.recentNews);
			return {
				summary: summary.summary,
				highlights: summary.highlights,
				timestamp: Date.now(),
			};
		} catch (err) {
			logger.error({ err }, "Failed to generate news summary via OpenRouter");
			return null;
		}
	}

	private async callOpenRouter(
		newsItems: AggregatedNewsItem[],
	): Promise<{ summary: string; highlights: string[] }> {
		const newsContext = newsItems
			.map(
				(item) =>
					`- [${item.source}] ${item.title}: ${item.summary} (at ${item.timestamp})`,
			)
			.join("\n");

		const prompt = `Here are the latest ${newsItems.length} news items:\n${newsContext}\n\nPlease provide:\n1. A short paragraph summarizing the overall market sentiment and key events.\n2. A list of 3-5 key bullet point highlights.\n\nReturn the answer as a JSON object with keys "summary" (string) and "highlights" (array of strings).`;
		const { text } = await generateText({
			model: this.openrouter.chat(this.agentConfig.model),
			system: this.agentConfig.systemPrompt,
			prompt: prompt,
			temperature: 0.5,
		});

		const content = text || "";

		// Attempt to clean JSON (remove markdown blocks if present)
		const cleanContent = content
			.replace(/```json/g, "")
			.replace(/```/g, "")
			.trim();

		// Attempt to parse JSON
		try {
			const parsed = JSON.parse(cleanContent);
			if (parsed.summary && Array.isArray(parsed.highlights)) {
				return {
					summary: parsed.summary,
					highlights: parsed.highlights,
				};
			}
		} catch (_e) {
			// Fallback if not valid JSON
			logger.warn(
				{ length: content.length },
				"LLM response not valid JSON, using raw text",
			);
		}

		return {
			summary: cleanContent,
			highlights: [],
		};
	}
}
