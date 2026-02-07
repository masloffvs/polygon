import { createOpenAI } from "@ai-sdk/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { embed } from "ai";
import { logger } from "../server/utils/logger";

// Initialize Qdrant client
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
});

// LM Studio for embeddings (OpenAI-compatible)
const lmstudioUrl = process.env.LMSTUDIO_URL || "http://192.168.1.222:1234/v1";
const lmstudio = createOpenAI({
  baseURL: lmstudioUrl,
  apiKey: "lm-studio",
});

const COLLECTION_NAME = "news_briefings";
const EMBEDDING_MODEL = "text-embedding-qwen3-embedding-0.6b@q8_0";

interface QdrantSearchResult {
  id: string;
  score: number;
  payload: {
    summary: string;
    highlights: string[];
    massiveEventCount: number;
    timestamp: number;
    date: string;
  };
}

export const getNewsSearchRoutes = () => ({
  "/api/news/search": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const query = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "10", 10);

      if (!query || query.trim().length < 2) {
        return Response.json(
          { error: "Query parameter 'q' is required (min 2 characters)" },
          { status: 400 },
        );
      }

      try {
        // 1. Embed the search query
        const { embedding } = await embed({
          model: lmstudio.embedding(EMBEDDING_MODEL),
          value: query.trim(),
        });

        // 2. Search in Qdrant
        const searchResults = await qdrant.search(COLLECTION_NAME, {
          vector: embedding,
          limit: limit,
          with_payload: true,
          score_threshold: 0.15, // Minimum relevance threshold
        });

        // 3. Transform results
        const results = searchResults.map((result) => {
          const payload = result.payload as QdrantSearchResult["payload"];
          return {
            id: result.id,
            score: result.score,
            summary: payload?.summary || "",
            highlights: payload?.highlights || [],
            eventCount: payload?.massiveEventCount || 0,
            timestamp: payload?.timestamp,
            date: payload?.date,
          };
        });

        return Response.json({
          query: query.trim(),
          count: results.length,
          results,
        });
      } catch (err) {
        logger.error({ err }, "Vector search failed");

        // Check if collection doesn't exist
        if (String(err).includes("doesn't exist")) {
          return Response.json({
            query: query.trim(),
            count: 0,
            results: [],
            message: "No news data indexed yet",
          });
        }

        return new Response("Search failed", { status: 500 });
      }
    },
  },

  // Search news_feed by text (fallback / combined)
  "/api/news/text-search": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const query = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "30", 10);

      if (!query || query.trim().length < 2) {
        return Response.json(
          { error: "Query parameter 'q' is required" },
          { status: 400 },
        );
      }

      try {
        const { clickhouse } = await import("../storage/clickhouse");

        // Full-text search in ClickHouse
        const result = await clickhouse.query({
          query: `
						SELECT * FROM news_feed FINAL
						WHERE positionCaseInsensitive(content, {query:String}) > 0
						   OR positionCaseInsensitive(author, {query:String}) > 0
						ORDER BY published_at DESC
						LIMIT {limit:Int32}
					`,
          query_params: { query: query.trim(), limit },
          format: "JSONEachRow",
        });

        const data = await result.json();
        return Response.json(data);
      } catch (err) {
        logger.error({ err }, "Text search failed");
        return new Response("Search failed", { status: 500 });
      }
    },
  },
});
