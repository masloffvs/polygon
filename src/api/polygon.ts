import type { Application } from "../server/application";
import { logger } from "../server/utils/logger";

export const getPolygonRoutes = (app: Application) => ({
	"/api/polygon/monitor": {
		async GET() {
			try {
				const { clickhouse } = await import("../storage/clickhouse");
				const res = await clickhouse.query({
					query: `SELECT * FROM monitored_addresses FINAL`,
					format: "JSONEachRow",
				});
				return Response.json(await res.json());
			} catch (_e) {
				return new Response("Error", { status: 500 });
			}
		},
		async POST(req: Request) {
			try {
				const body = await req.json();
				const { address, label } = body;

				if (!address) return new Response("Missing address", { status: 400 });

				// 1. Add to DB
				const { clickhouse } = await import("../storage/clickhouse");
				await clickhouse.insert({
					table: "monitored_addresses",
					values: [
						{
							address,
							label: label || "User",
							is_active: 1,
							added_at: Math.floor(Date.now() / 1000),
						},
					],
					format: "JSONEachRow",
				});

				// 2. Add to Runtime Source
				// We need to find the running source instance.
				const source = app.sources.find(
					(s) => s.id === "polygon-monitor-source",
				);
				if (source) {
					// We need to cast because BaseSource doesn't know about addMonitoredAddress
					// and we can't easily import the class here without circular deps maybe?
					// Or better, use 'any' for now or import type if possible.
					(source as any).addMonitoredAddress({
						address: address, // Type `0x${string}` technically required by viem but string usually passes
						label: label || "User",
						type: "external",
					});
				}

				return Response.json({ success: true });
			} catch (err) {
				logger.error({ err }, "Failed to add monitored address");
				return new Response("Internal Error", { status: 500 });
			}
		},
	},

	"/api/polygon/positions": {
		async GET() {
			try {
				const { clickhouse } = await import("../storage/clickhouse");
				const result = await clickhouse.query({
					query: `SELECT * FROM polygon_graph_positions FINAL`,
					format: "JSONEachRow",
				});
				const data = await result.json();
				return Response.json(data);
			} catch (err) {
				logger.error({ err }, "Failed to fetch positions");
				return new Response("Internal Error", { status: 500 });
			}
		},
		async POST(req: Request) {
			try {
				const body = await req.json();
				const { node_id, x, y, is_visible } = body;
				if (!node_id || x === undefined || y === undefined) {
					return new Response("Invalid body", { status: 400 });
				}

				const { clickhouse } = await import("../storage/clickhouse");
				await clickhouse.insert({
					table: "polygon_graph_positions",
					values: [
						{
							node_id,
							x,
							y,
							is_visible: is_visible !== undefined ? is_visible : 1, // Default to visible if saving position (dragging implies visibility)
							updated_at: Math.floor(Date.now() / 1000),
						},
					],
					format: "JSONEachRow",
				});
				return new Response("Saved", { status: 200 });
			} catch (err) {
				logger.error({ err }, "Failed to save position");
				return new Response("Internal Error", { status: 500 });
			}
		},
	},

	"/api/polygon/visibility": {
		async POST(req: Request) {
			try {
				const body = await req.json();
				const { node_id, is_visible } = body;

				if (!node_id || is_visible === undefined) {
					return new Response("Missing node_id or is_visible", {
						status: 400,
					});
				}

				const { clickhouse } = await import("../storage/clickhouse");

				// Get current state to preserve X/Y
				const current = await clickhouse.query({
					query: `SELECT * FROM polygon_graph_positions FINAL WHERE node_id = {node_id:String}`,
					query_params: { node_id },
					format: "JSONEachRow",
				});
				const rows = await current.json();
				const existing = rows[0] || { x: 0, y: 0 };

				await clickhouse.insert({
					table: "polygon_graph_positions",
					values: [
						{
							node_id,
							x: existing.x,
							y: existing.y,
							is_visible: is_visible ? 1 : 0,
							updated_at: Math.floor(Date.now() / 1000),
						},
					],
					format: "JSONEachRow",
				});

				return Response.json({ success: true });
			} catch (err) {
				logger.error({ err }, "Failed to update visibility");
				return new Response("Internal Error", { status: 500 });
			}
		},
	},

	"/api/polygon/transfers": {
		async GET(req: Request) {
			const url = new URL(req.url);
			// Default to a 24h window if not specified
			const start = parseInt(
				url.searchParams.get("start") ||
					(Date.now() - 24 * 60 * 60 * 1000).toString(),
				10,
			);

			try {
				const { clickhouse } = await import("../storage/clickhouse");
				const result = await clickhouse.query({
					query: `
                    SELECT * FROM polygon_transfers
                    WHERE timestamp >= toDateTime64({start:Int64}/1000, 3)
                    ORDER BY timestamp DESC
                    LIMIT 2000
                `,
					query_params: { start },
					format: "JSONEachRow",
				});
				const data = await result.json();
				return Response.json(data);
			} catch (err) {
				logger.error({ err }, "Failed to fetch polygon transfers");
				return new Response("Internal Server Error", { status: 500 });
			}
		},
	},
});
