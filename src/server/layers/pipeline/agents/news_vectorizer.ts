import { createOpenAI } from "@ai-sdk/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { embed } from "ai";
import { logger } from "../../../utils/logger";
import { type AgentConfig, PipelineAgent } from "../agent";
import type { GlobalBriefing } from "../stages/global_market_brief";
import type { ProcessingContext } from "../types";

export class NewsVectorizationAgent extends PipelineAgent<
  GlobalBriefing,
  { stored: number }
> {
  id = "news-vectorizer-agent";
  description = "Vectorizes Global Briefing and stores in Qdrant";
  inputs = ["global-briefing"];
  output = "news-vectors-stored";

  agentConfig: AgentConfig = {
    provider: "lmstudio",
    model: "text-embedding-qwen3-embedding-0.6b@q8_0",
    systemPrompt: "",
  };

  private qdrant: QdrantClient;
  private lmstudio: ReturnType<typeof createOpenAI>;
  private readonly COLLECTION_NAME = "news_briefings";
  private readonly EMBEDDING_SIZE = 1024; // Qwen3 embedding size
  private initialized = false;

  constructor() {
    super();
    const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
    this.qdrant = new QdrantClient({ url: qdrantUrl });

    // Local LM Studio server (OpenAI-compatible)
    const lmstudioUrl =
      process.env.LMSTUDIO_URL || "http://192.168.1.222:1234/v1";

    this.lmstudio = createOpenAI({
      baseURL: lmstudioUrl,
      apiKey: "lm-studio", // LM Studio doesn't need a real key
    });
  }

  private async ensureCollection() {
    if (this.initialized) return;

    try {
      const collections = await this.qdrant.getCollections();
      const exists = collections.collections.find(
        (c) => c.name === this.COLLECTION_NAME,
      );

      if (!exists) {
        await this.qdrant.createCollection(this.COLLECTION_NAME, {
          vectors: {
            size: this.EMBEDDING_SIZE, // Qwen3 embedding dimension
            distance: "Cosine",
          },
        });
        logger.info(
          { collection: this.COLLECTION_NAME },
          "Created Qdrant collection",
        );
      }
      this.initialized = true;
    } catch (err) {
      logger.error({ err }, "Failed to ensure Qdrant collection");
    }
  }

  public async process(
    data: GlobalBriefing,
    _context: ProcessingContext,
  ): Promise<{ stored: number } | null> {
    // Skip if no data, no summary, or placeholder summary
    if (!data || !data.summary) return null;
    if (
      data.summary.includes("Waiting for") ||
      data.summary.includes("Loading")
    ) {
      logger.debug({ stage: this.id }, "Skipping placeholder summary");
      return null;
    }
    if (data.highlights.length === 0) {
      logger.debug({ stage: this.id }, "Skipping empty highlights");
      return null;
    }

    await this.ensureCollection();

    try {
      // 1. Vectorize Summary using local LM Studio
      const textToEmbed = `${data.summary}\n\nHighlights:\n${data.highlights.join("\n")}`;

      const { embedding } = await embed({
        model: this.lmstudio.embedding(this.agentConfig.model),
        value: textToEmbed,
      });

      // 2. Prepare Payload
      const pointId = crypto.randomUUID();
      const payload = {
        summary: data.summary,
        highlights: data.highlights,
        massiveEventCount: data.massiveEvents.length,
        timestamp: data.updatedAt,
        date: new Date(data.updatedAt).toISOString(),
      };

      // 3. Store in Qdrant
      await this.qdrant.upsert(this.COLLECTION_NAME, {
        points: [
          {
            id: pointId,
            vector: embedding,
            payload: payload,
          },
        ],
      });

      logger.info(
        { stage: this.id, id: pointId },
        "Stored vectorized briefing in Qdrant",
      );

      // Also vectorise individual massive events?
      // For now just the main briefing as requested.

      return { stored: 1 };
    } catch (err) {
      logger.error({ err }, "Failed to vectorize and store news");
      return null;
    }
  }
}
