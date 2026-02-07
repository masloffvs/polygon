import { createOpenAI } from "@ai-sdk/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { embed, embedMany } from "ai";
import * as math from "mathjs"; // For cosine similarity
import { logger } from "../../../utils/logger";
import { type AgentConfig, PipelineAgent } from "../agent";
import type { GlobalBriefing } from "../stages/global_market_brief";
import type { ProcessingContext } from "../types";

export interface MarketImpact {
  marketId: string;
  ticker: string;
  title: string;
  volume24hr: number;
  newsRelevance: number; // 0 to 1
  impactScore: number; // Combined score (volume * relevance)
  relatedHighlights: string[]; // From news
  prob?: number; // Current Probability
}

export interface NewsImpactAnalysisRaw {
  timestamp: number;
  markets: MarketImpact[];
}

export class NewsImpactAgent extends PipelineAgent<
  GlobalBriefing,
  NewsImpactAnalysisRaw
> {
  id = "news-impact-agent";
  description =
    "Calculates impact of news on massive markets using Vector Similarity";
  inputs = ["global-briefing"];
  output = "news-impact-analysis";

  agentConfig: AgentConfig = {
    provider: "lmstudio",
    model: "text-embedding-qwen3-embedding-0.6b@q8_0",
    systemPrompt: "",
  };
  private lmstudio: ReturnType<typeof createOpenAI>;

  constructor() {
    super();
    this.qdrant = new QdrantClient({
      url: process.env.QDRANT_URL || "http://localhost:6333",
    });

    // Local LM Studio server (OpenAI-compatible)
    const lmstudioUrl =
      process.env.LMSTUDIO_URL || "http://192.168.1.222:1234/v1";

    this.lmstudio = createOpenAI({
      baseURL: lmstudioUrl,
      apiKey: "lm-studio", // LM Studio doesn't need a real key
    });
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    return (
      math.dot(vecA, vecB) /
      (((math.norm(vecA) as number) * math.norm(vecB)) as number)
    );
  }

  public async process(
    data: GlobalBriefing,
    _context: ProcessingContext,
  ): Promise<NewsImpactAnalysisRaw | null> {
    if (!data || !data.summary || data.massiveEvents.length === 0) return null;

    try {
      // 1. Get the News Vector
      // We could re-embed here to avoid race condition with Qdrant storage,
      // or fetch from Qdrant if we are sure it's consistent.
      // Re-embedding is safer and stateless.
      // Cost is minimal for one summary.
      const textToEmbed = `${data.summary}\n\nHighlights:\n${data.highlights.join("\n")}`;
      const { embedding: newsVector } = await embed({
        model: this.lmstudio.embedding(this.agentConfig.model),
        value: textToEmbed,
      });

      // 1.5 Embed Individual Highlights for Attribution
      let highlightVectors: number[][] = [];
      if (data.highlights && data.highlights.length > 0) {
        const { embeddings } = await embedMany({
          model: this.lmstudio.embedding(this.agentConfig.model),
          values: data.highlights,
        });
        highlightVectors = embeddings;
      }

      // 2. Embed Markets (Batch)
      // We focus on titles and descriptions of the massive events
      const marketTexts = data.massiveEvents.map(
        (evt) => `${evt.title}. ${evt.description || evt.subtitle || ""}`,
      );

      // Embed in batch using embedMany
      const { embeddings: marketVectors } = await embedMany({
        model: this.lmstudio.embedding(this.agentConfig.model),
        values: marketTexts,
      });

      // 3. Calculate Similarity and Scores
      const impacts: MarketImpact[] = [];

      data.massiveEvents.forEach((evt, idx) => {
        const marketVec = marketVectors[idx];
        const similarity = this.cosineSimilarity(newsVector, marketVec);

        // Filter valid similarity (0-1)
        const relevance = Math.max(0, similarity);

        // Heuristic Impact Score: Log(Volume) * Relevance
        // Events usually have volume > 1000.
        // Log10(1000) = 3. Log10(1M) = 6.
        // Relevance ~ 0.2 - 0.5 usually for related topics.
        const logVol = Math.log10(evt.volume24hr || 1);
        const score = logVol * relevance * 10; // Scale to 0-100 roughly

        // Find attribution (Best matching highlight)
        const attributions: string[] = [];
        if (highlightVectors.length > 0) {
          const highlightScores = highlightVectors.map((hVec, hIdx) => ({
            idx: hIdx,
            score: this.cosineSimilarity(marketVec, hVec),
          }));
          // Sort by best match
          highlightScores.sort((a, b) => b.score - a.score);

          // Take top 1 if it's relevant enough
          if (highlightScores[0].score > 0.2) {
            attributions.push(data.highlights[highlightScores[0].idx]);
          }
        }

        if (relevance > 0.15) {
          // Only keep relevant ones
          // Try to extract prob from event markets if available
          let prob = 0;
          if (evt.markets && evt.markets.length > 0) {
            // Take the first market's outcome price or average?
            // Usually massive events might have one main binary market.
            // We'll take the max price/prob found to be safe or just the first.
            prob = Number(
              evt.markets[0].group?.[0]?.price ||
                evt.markets[0].outcomePrices?.[0] ||
                0,
            );
            // Gamma API structure varies, assuming standard.
          }

          impacts.push({
            marketId: evt.id,
            ticker: evt.ticker || evt.slug?.slice(0, 10) || "UNK",
            title: evt.title,
            volume24hr: evt.volume24hr,
            newsRelevance: relevance,
            impactScore: score,
            relatedHighlights: attributions,
            prob: prob,
          });
        }
      });

      // Sort by Impact Score
      impacts.sort((a, b) => b.impactScore - a.impactScore);

      return {
        timestamp: Date.now(),
        markets: impacts,
      };
    } catch (err) {
      logger.error({ err }, "Failed to calculate news impact");
      return null;
    }
  }
}
