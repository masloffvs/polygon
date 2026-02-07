import type { Application } from "../server/application";
import { logger } from "../server/utils/logger";

export const getSystemRoutes = (app?: Application) => ({
	"/api/system/status": {
		async GET() {
			return Response.json({
				isRunning: app?.dataStudioRuntime.isActive ?? false,
			});
		},
	},
	"/api/system/storage": {
		async GET() {
			try {
				const { clickhouse } = await import("../storage/clickhouse");
				const result = await clickhouse.query({
					query: `
                SELECT
                    database,
                    table,
                    formatReadableSize(sum(bytes_on_disk)) as size,
                    sum(bytes_on_disk) as size_bytes,
                    count() as parts,
                    sum(rows) as rows
                FROM system.parts
                WHERE active
                GROUP BY database, table
                ORDER BY size_bytes DESC
            `,
					format: "JSONEachRow",
				});
				const data = await result.json();
				return Response.json(data);
			} catch (err) {
				logger.error({ err }, "Failed to fetch storage metrics");
				return new Response("Failed to fetch storage metrics", {
					status: 500,
				});
			}
		},
	},
	"/api/system/logs": {
		async GET(req: Request) {
			const url = new URL(req.url);
			const source = url.searchParams.get("source");
			const _limit = parseInt(url.searchParams.get("limit") || "50", 10);

			try {
				if (source === "tick-tack-registrator") {
					return Response.json([
						{
							ts: new Date().toISOString(),
							level: "info",
							msg: "✅ TICK ACCEPTED & REGISTERED",
							tick: 1,
							source: "tick-tack-registrator",
						},
						{
							ts: new Date(Date.now() - 60000).toISOString(),
							level: "info",
							msg: "✅ TICK ACCEPTED & REGISTERED",
							tick: 2,
							source: "tick-tack-registrator",
						},
					]);
				}

				return Response.json([]);
			} catch (_err) {
				return new Response("Internal Error", { status: 500 });
			}
		},
	},
});
