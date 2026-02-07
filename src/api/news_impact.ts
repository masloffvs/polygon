import { createOpenAI } from "@ai-sdk/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { embed } from "ai";

// Qdrant for vector search
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
});

// LM Studio for embeddings
const lmstudioUrl = process.env.LMSTUDIO_URL || "http://192.168.1.222:1234/v1";
const lmstudio = createOpenAI({
  baseURL: lmstudioUrl,
  apiKey: "lm-studio",
});

const COLLECTION_NAME = "news_briefings";
const EMBEDDING_MODEL = "text-embedding-qwen3-embedding-0.6b@q8_0";

export const getNewsImpactRoutes = () => ({
  "/api/news-impact/history": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const marketId = url.searchParams.get("marketId");
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);

      try {
        const { clickhouse } = await import("../storage/clickhouse");

        let query: string;
        let queryParams: Record<string, string | number>;

        if (marketId) {
          query = `
						SELECT * FROM news_market_impact
						WHERE market_id = {marketId:String}
						ORDER BY timestamp DESC
						LIMIT {limit:Int32}
					`;
          queryParams = { marketId, limit };
        } else {
          query = `
						SELECT * FROM news_market_impact
						ORDER BY timestamp DESC
						LIMIT {limit:Int32}
					`;
          queryParams = { limit };
        }

        const result = await clickhouse.query({
          query: query,
          query_params: queryParams,
          format: "JSONEachRow",
        });

        interface NewsImpactRow {
          market_id: string;
          timestamp: string;
          [key: string]: unknown;
        }

        const data = (await result.json()) as NewsImpactRow[];
        return Response.json(data.reverse()); // Return ASC for chart
      } catch (err) {
        console.error(err);
        return new Response("Failed to fetch history", { status: 500 });
      }
    },
  },

  // Get impact details with related news (vector search by market title)
  "/api/news-impact/details": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const marketId = url.searchParams.get("marketId");
      const title = url.searchParams.get("title");

      if (!marketId) {
        return Response.json(
          { error: "marketId is required" },
          { status: 400 },
        );
      }

      try {
        const { clickhouse } = await import("../storage/clickhouse");

        // 1. Get impact history for this market
        const historyResult = await clickhouse.query({
          query: `
            SELECT * FROM news_market_impact
            WHERE market_id = {marketId:String}
            ORDER BY timestamp DESC
            LIMIT 20
          `,
          query_params: { marketId },
          format: "JSONEachRow",
        });
        const history = await historyResult.json();

        // 2. Get related news via vector search if we have a title
        let relatedNews: Array<{
          score: number;
          summary: string;
          highlights: string[];
          date: string;
        }> = [];

        if (title) {
          try {
            // Embed the market title
            const { embedding } = await embed({
              model: lmstudio.embedding(EMBEDDING_MODEL),
              value: title,
            });

            // Search in Qdrant for similar news
            const searchResults = await qdrant.search(COLLECTION_NAME, {
              vector: embedding,
              limit: 5,
              with_payload: true,
              score_threshold: 0.2,
            });

            relatedNews = searchResults.map((r) => {
              const payload = r.payload as {
                summary: string;
                highlights: string[];
                date: string;
              };
              return {
                score: r.score,
                summary: payload?.summary || "",
                highlights: payload?.highlights || [],
                date: payload?.date || "",
              };
            });
          } catch (vecErr) {
            console.error("Vector search failed:", vecErr);
            // Continue without vector results
          }
        }

        // 3. Also get recent news from news_feed that mention the ticker
        const ticker = (history as Array<{ ticker: string }>)[0]?.ticker;
        let mentionedNews: unknown[] = [];

        if (ticker) {
          const newsResult = await clickhouse.query({
            query: `
              SELECT * FROM news_feed FINAL
              WHERE positionCaseInsensitive(content, {ticker:String}) > 0
              ORDER BY published_at DESC
              LIMIT 10
            `,
            query_params: { ticker },
            format: "JSONEachRow",
          });
          mentionedNews = await newsResult.json();
        }

        return Response.json({
          marketId,
          history,
          relatedNews,
          mentionedNews,
        });
      } catch (err) {
        console.error(err);
        return new Response("Failed to fetch impact details", { status: 500 });
      }
    },
  },
});
