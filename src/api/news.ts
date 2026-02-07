import { logger } from "../server/utils/logger";

export const getNewsRoutes = () => ({
  "/api/news": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      try {
        // Lazy import clickhouse to avoid circular dependency issues if any
        const { clickhouse } = await import("../storage/clickhouse");
        // Query from both news_feed and news_api_articles
        const result = await clickhouse.query({
          query: `
                    SELECT * FROM (
                        SELECT 
                            uuid,
                            original_id,
                            source,
                            content,
                            url,
                            author,
                            score,
                            published_at,
                            created_at
                        FROM news_feed FINAL
                        
                        UNION ALL
                        
                        SELECT 
                            id as uuid,
                            id as original_id,
                            source_name as source,
                            concat(title, '. ', coalesce(description, '')) as content,
                            url,
                            coalesce(author, 'Unknown') as author,
                            0.0 as score,
                            published_at,
                            ingested_at as created_at
                        FROM news_api_articles
                    )
                    ORDER BY published_at DESC 
                    LIMIT {limit:Int32} OFFSET {offset:Int32}
                `,
          query_params: { limit, offset },
          format: "JSONEachRow",
        });
        const data = await result.json();
        return Response.json(data);
      } catch (err) {
        logger.error({ err }, "Failed to fetch news");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },
});
