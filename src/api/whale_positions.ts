// src/api/whale_positions.ts
import { logger } from "../server/utils/logger";

export const getWhalePositionsRoutes = () => ({
  "/api/whale-positions": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "100", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      const category = url.searchParams.get("category") || "";
      const minValue = parseFloat(url.searchParams.get("minValue") || "300000");
      const hoursAgo = parseInt(url.searchParams.get("hours") || "24", 10);

      try {
        const { clickhouse } = await import("../storage/clickhouse");

        const whereConditions: string[] = [];
        const params: Record<string, string | number> = {
          limit: Math.min(limit, 500),
          offset,
          minValue,
        };

        // Filter by category
        if (category) {
          whereConditions.push("category = {category:String}");
          params.category = category;
        }

        // Filter by minimum value
        whereConditions.push("value_usd >= {minValue:Float64}");

        // Filter by time window
        whereConditions.push(`timestamp >= now() - INTERVAL ${hoursAgo} HOUR`);

        const whereClause =
          whereConditions.length > 0
            ? `WHERE ${whereConditions.join(" AND ")}`
            : "";

        const query = `
					SELECT
						user_address,
						username,
						profile_image,
						category,
						asset,
						title,
						outcome,
						side,
						size,
						avg_price,
						current_price,
						value_usd,
						pnl,
						pnl_percent,
						timestamp,
						ingested_at
					FROM whale_positions
					${whereClause}
					ORDER BY value_usd DESC, timestamp DESC
					LIMIT {limit:Int32}
					OFFSET {offset:Int32}
				`;

        const result = await clickhouse.query({
          query,
          query_params: params,
          format: "JSONEachRow",
        });

        const data = await result.json();
        return Response.json(data);
      } catch (err) {
        logger.error({ err }, "Failed to fetch whale positions");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },

  "/api/whale-positions/stats": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const hoursAgo = parseInt(url.searchParams.get("hours") || "24", 10);

      try {
        const { clickhouse } = await import("../storage/clickhouse");

        // Aggregate stats by category
        const query = `
					SELECT
						category,
						count() as position_count,
						sum(value_usd) as total_value,
						avg(value_usd) as avg_value,
						max(value_usd) as max_value,
						countDistinct(user_address) as unique_traders
					FROM whale_positions
					WHERE timestamp >= now() - INTERVAL ${hoursAgo} HOUR
					GROUP BY category
					ORDER BY total_value DESC
				`;

        const result = await clickhouse.query({
          query,
          format: "JSONEachRow",
        });

        const categories = await result.json();

        // Overall stats
        const overallQuery = `
					SELECT
						count() as total_positions,
						sum(value_usd) as total_value,
						avg(value_usd) as avg_value,
						max(value_usd) as max_value,
						countDistinct(user_address) as unique_traders
					FROM whale_positions
					WHERE timestamp >= now() - INTERVAL ${hoursAgo} HOUR
				`;

        const overallResult = await clickhouse.query({
          query: overallQuery,
          format: "JSONEachRow",
        });

        const overallData = (await overallResult.json()) as Record<
          string,
          unknown
        >[];
        const overall = overallData[0] || {};

        return Response.json({
          overall,
          byCategory: categories,
          timeWindow: `${hoursAgo}h`,
        });
      } catch (err) {
        logger.error({ err }, "Failed to fetch whale positions stats");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },

  "/api/whale-positions/top-traders": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);
      const hoursAgo = parseInt(url.searchParams.get("hours") || "24", 10);

      try {
        const { clickhouse } = await import("../storage/clickhouse");

        const query = `
					SELECT
						user_address,
						any(username) as username,
						any(profile_image) as profile_image,
						count() as position_count,
						sum(value_usd) as total_value,
						avg(pnl_percent) as avg_pnl_percent,
						groupArray(category) as categories
					FROM whale_positions
					WHERE timestamp >= now() - INTERVAL ${hoursAgo} HOUR
					GROUP BY user_address
					ORDER BY total_value DESC
					LIMIT {limit:Int32}
				`;

        const result = await clickhouse.query({
          query,
          query_params: { limit: Math.min(limit, 100) },
          format: "JSONEachRow",
        });

        const data = await result.json();
        return Response.json(data);
      } catch (err) {
        logger.error({ err }, "Failed to fetch top whale traders");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },
});
