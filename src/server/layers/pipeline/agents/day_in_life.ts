import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { logger } from "../../../utils/logger";
import { type AgentConfig, PipelineAgent } from "../agent";
import type { ProcessingContext } from "../types";

// Models to use for multi-perspective summarization
const MODELS = [
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
];

interface NewsItem {
  uuid: string;
  source: string;
  content: string;
  author: string;
  published_at: string;
}

interface ModelSummary {
  modelId: string;
  modelName: string;
  summary: string;
  highlights: string[];
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  processingTime: number;
  error?: string;
}

export interface DayInLifeInput {
  date: string; // YYYY-MM-DD format
}

export interface DayInLifeOutput {
  date: string;
  newsCount: number;
  sources: Record<string, number>;
  summaries: ModelSummary[];
  consensusSentiment: string;
  timestamp: number;
}

export class DayInLifeAgent extends PipelineAgent<
  DayInLifeInput,
  DayInLifeOutput
> {
  id = "day-in-life-agent";
  description =
    "Fetches all news for a specific day and summarizes using multiple AI models";
  inputs = ["day-in-life-request"];
  output = "day-in-life-result";

  agentConfig: AgentConfig = {
    provider: "openrouter",
    model: "multiple", // We use multiple models
    systemPrompt: `You are a financial news analyst. Analyze the provided news items and create a summary.

RESPOND ONLY WITH VALID JSON. No explanations, no markdown, no text before or after.

Exact format required:
{"summary":"2-3 paragraph summary here","highlights":["point 1","point 2","point 3"],"sentiment":"bullish"}

Sentiment must be one of: bullish, bearish, neutral, mixed

Focus on: market-moving events, political developments, crypto news, price movements.`,
  };

  private openrouter: ReturnType<typeof createOpenRouter>;

  constructor() {
    super();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for DayInLifeAgent");
    }

    this.openrouter = createOpenRouter({
      apiKey,
      headers: {
        "HTTP-Referer": "https://polygon-bot.com",
        "X-Title": "Polygon Bot - Day In Life",
      },
    });
  }

  private async fetchNewsForDate(date: string): Promise<NewsItem[]> {
    const { clickhouse } = await import("@/storage/clickhouse");

    // Parse date and create range
    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    // Query from both news_feed and news_api_articles tables
    const result = await clickhouse.query({
      query: `
        SELECT uuid, source, content, author, published_at FROM (
          SELECT uuid, source, content, author, published_at
          FROM news_feed FINAL
          WHERE published_at >= {startOfDay:String}
            AND published_at <= {endOfDay:String}
          
          UNION ALL
          
          SELECT 
            id as uuid, 
            source_name as source, 
            concat(title, '. ', coalesce(description, '')) as content, 
            coalesce(author, 'Unknown') as author, 
            published_at
          FROM news_api_articles
          WHERE published_at >= {startOfDay:String}
            AND published_at <= {endOfDay:String}
        )
        ORDER BY published_at ASC
      `,
      query_params: { startOfDay, endOfDay },
      format: "JSONEachRow",
    });

    return (await result.json()) as NewsItem[];
  }

  private buildPrompt(news: NewsItem[], date: string): string {
    const newsText = news
      .map(
        (n, i) =>
          `[${i + 1}] [${n.source}] ${n.content.slice(0, 500)}${n.content.length > 500 ? "..." : ""}`,
      )
      .join("\n\n");

    return `Analyze the following ${news.length} news items from ${date}:

${newsText}

Provide a comprehensive summary of this day's events.`;
  }

  private async callModel(
    modelId: string,
    modelName: string,
    prompt: string,
  ): Promise<ModelSummary> {
    const startTime = Date.now();

    try {
      const { text } = await generateText({
        model: this.openrouter.chat(modelId),
        system: this.agentConfig.systemPrompt,
        prompt,
        temperature: 0.3,
      });

      const processingTime = Date.now() - startTime;

      // Parse response - try multiple extraction methods
      const parsed = this.extractJSON(text);

      if (parsed) {
        return {
          modelId,
          modelName,
          summary: parsed.summary || "No summary provided",
          highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
          sentiment: this.normalizeSentiment(parsed.sentiment),
          processingTime,
        };
      }

      // Fallback - use raw text as summary
      return {
        modelId,
        modelName,
        summary: text
          .replace(/```[a-z]*\n?/g, "")
          .trim()
          .slice(0, 2000),
        highlights: [],
        sentiment: "neutral",
        processingTime,
      };
    } catch (err) {
      const processingTime = Date.now() - startTime;
      logger.error({ modelId, err }, "Model call failed");

      return {
        modelId,
        modelName,
        summary: "",
        highlights: [],
        sentiment: "neutral",
        processingTime,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  private extractJSON(
    text: string,
  ): { summary?: string; highlights?: string[]; sentiment?: string } | null {
    // Method 1: Try direct parse after cleaning
    const cleanText = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      return JSON.parse(cleanText);
    } catch {
      // Continue to next method
    }

    // Method 2: Find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*"summary"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Continue to next method
      }
    }

    // Method 3: Extract fields manually with regex
    const summaryMatch = text.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const highlightsMatch = text.match(/"highlights"\s*:\s*\[([\s\S]*?)\]/);
    const sentimentMatch = text.match(/"sentiment"\s*:\s*"([^"]+)"/);

    if (summaryMatch?.[1]) {
      const highlights: string[] = [];
      if (highlightsMatch?.[1]) {
        const items = highlightsMatch[1].match(/"((?:[^"\\]|\\.)*)"/g);
        if (items) {
          for (const item of items) {
            highlights.push(item.replace(/^"|"$/g, "").replace(/\\"/g, '"'));
          }
        }
      }
      return {
        summary: summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
        highlights,
        sentiment: sentimentMatch?.[1] || "neutral",
      };
    }

    return null;
  }

  private normalizeSentiment(
    sentiment?: string,
  ): "bullish" | "bearish" | "neutral" | "mixed" {
    if (!sentiment) return "neutral";
    const lower = sentiment.toLowerCase().trim();
    if (lower === "bullish") return "bullish";
    if (lower === "bearish") return "bearish";
    if (lower === "mixed") return "mixed";
    return "neutral";
  }

  private calculateConsensus(summaries: ModelSummary[]): string {
    const validSummaries = summaries.filter((s) => !s.error);
    if (validSummaries.length === 0) return "unknown";

    const sentiments = validSummaries.map((s) => s.sentiment);
    const counts: Record<string, number> = {};

    for (const s of sentiments) {
      counts[s] = (counts[s] || 0) + 1;
    }

    // Find majority
    let maxCount = 0;
    let consensus = "mixed";

    for (const [sentiment, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        consensus = sentiment;
      }
    }

    // If no clear majority, it's mixed
    if (maxCount < validSummaries.length / 2) {
      consensus = "mixed";
    }

    return consensus;
  }

  public async process(
    data: DayInLifeInput,
    _context: ProcessingContext,
  ): Promise<DayInLifeOutput | null> {
    if (!data?.date) {
      logger.warn({ agent: this.id }, "No date provided");
      return null;
    }

    logger.info({ agent: this.id, date: data.date }, "Processing Day In Life");

    try {
      // 1. Fetch news for the date
      const news = await this.fetchNewsForDate(data.date);

      if (news.length === 0) {
        return {
          date: data.date,
          newsCount: 0,
          sources: {},
          summaries: [],
          consensusSentiment: "no data",
          timestamp: Date.now(),
        };
      }

      // 2. Count sources
      const sources: Record<string, number> = {};
      for (const n of news) {
        sources[n.source] = (sources[n.source] || 0) + 1;
      }

      // 3. Build prompt
      const prompt = this.buildPrompt(news, data.date);

      // 4. Call all models in parallel
      logger.info(
        { agent: this.id, newsCount: news.length, models: MODELS.length },
        "Sending to multiple models",
      );

      const summaryPromises = MODELS.map((m) =>
        this.callModel(m.id, m.name, prompt),
      );

      const summaries = await Promise.all(summaryPromises);

      // 5. Calculate consensus
      const consensusSentiment = this.calculateConsensus(summaries);

      logger.info(
        {
          agent: this.id,
          date: data.date,
          newsCount: news.length,
          successfulModels: summaries.filter((s) => !s.error).length,
        },
        "Day In Life completed",
      );

      return {
        date: data.date,
        newsCount: news.length,
        sources,
        summaries,
        consensusSentiment,
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.error({ agent: this.id, err }, "Day In Life failed");
      return null;
    }
  }
}
