import { logger } from "../server/utils/logger";

export const getPolymarketRoutes = () => ({
	"/api/polymarket/snapshot": {
		async GET(req: Request) {
			const url = new URL(req.url);
			const limit = parseInt(url.searchParams.get("limit") || "100", 10);
			const search = url.searchParams.get("search") || "";
			const side = url.searchParams.get("side") || "ALL";
			const minValue = parseFloat(url.searchParams.get("minValue") || "0");

			try {
				const { clickhouse } = await import("../storage/clickhouse");

				// Build WHERE clauses for outer query (filter AFTER dedup via subquery)
				const whereConditions: string[] = [];
				const params: Record<string, any> = { limit: Math.min(limit, 100) };

				if (search) {
					whereConditions.push(
						`(lower(title) LIKE {search:String} OR lower(outcome) LIKE {search:String})`,
					);
					params.search = `%${search.toLowerCase()}%`;
				}

				if (side !== "ALL") {
					whereConditions.push(`side = {side:String}`);
					params.side = side;
				}

				if (minValue > 0) {
					whereConditions.push(`usdcValue >= {minValue:Float64}`);
					params.minValue = minValue;
				}

				const whereClause =
					whereConditions.length > 0
						? `WHERE ${whereConditions.join(" AND ")}`
						: "";

				const result = await clickhouse.query({
					query: `
              SELECT 
                transactionHash,
                ts_iso as timestamp,
                side,
                asset,
                title,
                size,
                price,
                usdcValue,
                proxyWallet,
                outcome,
                eventSlug
              FROM (
                SELECT 
                  transactionHash,
                  formatDateTime(max(timestamp), '%Y-%m-%dT%H:%M:%S', 'UTC') as ts_iso,
                  argMax(side, timestamp) as side,
                  argMax(asset, timestamp) as asset,
                  argMax(title, timestamp) as title,
                  argMax(size, timestamp) as size,
                  argMax(price, timestamp) as price,
                  argMax(usdcValue, timestamp) as usdcValue,
                  argMax(proxyWallet, timestamp) as proxyWallet,
                  argMax(outcome, timestamp) as outcome,
                  argMax(eventSlug, timestamp) as eventSlug
                FROM polymarket_activity
                GROUP BY transactionHash
              )
              ${whereClause}
              ORDER BY ts_iso DESC
              LIMIT {limit:Int32}
            `,
					query_params: params,
					format: "JSONEachRow",
				});

				const data = await result.json();
				return Response.json(data);
			} catch (err) {
				logger.error({ err }, "Failed to fetch polymarket snapshot");
				return new Response("Internal Server Error", { status: 500 });
			}
		},
	},

	"/api/polymarket/activity": {
		async GET(req: Request) {
			const url = new URL(req.url);
			const limit = parseInt(url.searchParams.get("limit") || "50", 10);
			const offset = parseInt(url.searchParams.get("offset") || "0", 10);
			const search = url.searchParams.get("search") || "";
			const side = url.searchParams.get("side") || "ALL";
			const minValue = parseFloat(url.searchParams.get("minValue") || "0");

			try {
				const { clickhouse } = await import("../storage/clickhouse");
				const whereConditions: string[] = [];
				const params: Record<string, any> = {
					limit: Math.min(limit, 1000),
					offset: Math.max(offset, 0),
				};

				if (search) {
					whereConditions.push(
						`(lower(title) LIKE {search:String} OR lower(outcome) LIKE {search:String})`,
					);
					params.search = `%${search.toLowerCase()}%`;
				}

				if (side !== "ALL") {
					whereConditions.push(`side = {side:String}`);
					params.side = side;
				}

				if (minValue > 0) {
					whereConditions.push(`usdcValue >= {minValue:Float64}`);
					params.minValue = minValue;
				}

				const whereClause =
					whereConditions.length > 0
						? `WHERE ${whereConditions.join(" AND ")}`
						: "";

				const result = await clickhouse.query({
					query: `
                    SELECT DISTINCT
                      transactionHash,
                      timestamp,
                      side,
                      asset,
                      title,
                      size,
                      price,
                      usdcValue,
                      proxyWallet,
                      outcome,
                      eventSlug,
                      ingested_at
                    FROM polymarket_activity
                    ${whereClause}
                    ORDER BY timestamp DESC
                    LIMIT {limit:Int32} OFFSET {offset:Int32}
                `,
					query_params: params,
					format: "JSONEachRow",
				});
				const data = await result.json();
				return Response.json(data);
			} catch (err) {
				logger.error({ err }, "Failed to fetch polymarket activity");
				return new Response("Internal Server Error", { status: 500 });
			}
		},
	},
});
