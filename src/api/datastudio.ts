import type { Application } from "@/server/application";
import SourceInputNode from "@/server/dataFlowNodes/Connectors/SourceInput";
import ScheduledTriggerNode from "@/server/dataFlowNodes/Core/ClockTrigger";
import ImagenNode from "@/server/dataFlowNodes/Integrations/Imagen";
import TimedCollectorNode from "../server/dataFlowNodes/Storage/TimedCollector";
import TriggeredDropNode from "../server/dataFlowNodes/Storage/TriggeredDrop";
import { triggerBus } from "../server/dataflow/TriggerBus";
import { logger } from "../server/utils/logger";
import { getRedis } from "../server/utils/redis";
import { getTimedCollectorCollection } from "../storage/mongodb";

export const getDatastudioRoutes = (app?: Application) => ({
  /**
   * API Trigger endpoint
   * POST /api/datastudio/trigger
   * Body: { "key": "trigger-key", "payload": { ... } }
   *
   * Fires an event to all ApiTrigger nodes matching the key.
   */
  "/api/datastudio/trigger": {
    async POST(req) {
      try {
        const body = await req.json();
        const { key, payload } = body;

        if (!key || typeof key !== "string") {
          return Response.json(
            { error: "Missing or invalid 'key' field" },
            { status: 400 },
          );
        }

        // Fire the trigger event via Redis Pub/Sub
        await triggerBus.fire(key, payload ?? {});

        logger.info({ key, hasPayload: !!payload }, "API Trigger fired");

        return Response.json({
          success: true,
          key,
          timestamp: Date.now(),
        });
      } catch (err) {
        logger.error({ err }, "Failed to process trigger request");
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }
    },
  },

  "/api/datastudio/redis-memo": {
    async GET(req) {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");

      if (!id) {
        return new Response("Missing 'id' parameter", { status: 400 });
      }

      try {
        const redis = getRedis();
        const key = `node:${id}:memo`;
        const data = await redis.get(key);
        const ttl = await redis.ttl(key);

        if (data) {
          const parsed = JSON.parse(data);
          return Response.json({
            value: parsed,
            ttl,
            restored: true,
            timestamp: Date.now(), // approximation, or we should store timestamp in redis too
          });
        } else {
          return new Response(null, { status: 204 });
        }
      } catch (err) {
        logger.error({ err, id }, "Failed to fetch redis memo");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },

  /**
   * Cron endpoint - called every hour by external cron service
   * Triggers flush on all TimedCollector nodes that are ready
   */
  "/api/datastudio/timed-collector/cron": {
    async POST(_req) {
      if (!app) {
        return new Response("Application not initialized", { status: 500 });
      }

      try {
        const runtime = app.dataStudioRuntime;
        const now = new Date();
        const results: Array<{
          nodeId: string;
          success: boolean;
          packetCount: number;
          message: string;
        }> = [];

        // Find all running TimedCollector nodes
        const nodes = runtime.getNodesByType("timed-collector");

        for (const node of nodes) {
          if (node instanceof TimedCollectorNode) {
            const context = {
              traceId: crypto.randomUUID(),
              logger: {
                info: (msg: string, data?: any) =>
                  logger.info({ ...data }, msg),
                warn: (msg: string, data?: any) =>
                  logger.warn({ ...data }, msg),
                error: (msg: string, err?: any) => logger.error({ err }, msg),
              },
              attempt: 1,
            };

            const result = await node.flush(context);
            results.push({
              nodeId: node.id,
              success: result.success,
              packetCount: result.packetCount,
              message: result.message,
            });
          }
        }

        const totalFlushed = results.reduce((sum, r) => sum + r.packetCount, 0);
        const successCount = results.filter((r) => r.success).length;

        logger.info(
          { totalFlushed, successCount, nodeCount: results.length },
          "Cron: TimedCollector flush completed",
        );

        return Response.json({
          success: true,
          timestamp: now.toISOString(),
          utcHour: now.getUTCHours(),
          utcMinute: now.getUTCMinutes(),
          nodesProcessed: results.length,
          totalPacketsFlushed: totalFlushed,
          results,
        });
      } catch (err) {
        logger.error({ err }, "Cron: TimedCollector flush failed");
        return Response.json(
          { success: false, error: String(err) },
          { status: 500 },
        );
      }
    },
  },

  /**
   * Get stats for a specific TimedCollector node
   */
  "/api/datastudio/timed-collector/stats": {
    async GET(req) {
      if (!app) {
        return new Response("Application not initialized", { status: 500 });
      }

      const url = new URL(req.url);
      const id = url.searchParams.get("id");

      if (!id) {
        return new Response("Missing 'id' parameter", { status: 400 });
      }

      try {
        const runtime = app.dataStudioRuntime;
        const node = runtime.getNodeById(id);

        if (!node || !(node instanceof TimedCollectorNode)) {
          return new Response("Node not found or not a TimedCollector", {
            status: 404,
          });
        }

        const stats = await node.getStats();
        const now = new Date();

        return Response.json({
          ...stats,
          currentUTCHour: now.getUTCHours(),
          currentUTCMinute: now.getUTCMinutes(),
          isWithinFlushWindow: TimedCollectorNode.isWithinFlushWindow(
            now,
            stats.dropInterval,
          ),
        });
      } catch (err) {
        logger.error({ err, id }, "Failed to fetch TimedCollector stats");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },

  /**
   * Get pending data preview for a TimedCollector node
   */
  "/api/datastudio/timed-collector/pending": {
    async GET(req) {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      const limit = Math.min(100, Number(url.searchParams.get("limit")) || 20);

      if (!id) {
        return new Response("Missing 'id' parameter", { status: 400 });
      }

      try {
        const collection = getTimedCollectorCollection(id);
        const docs = await collection
          .find({ flushed: false })
          .sort({ timestamp: -1 })
          .limit(limit)
          .toArray();

        const count = await collection.countDocuments({ flushed: false });

        return Response.json({
          pending: docs.map((d) => ({
            source: d.source,
            timestamp: d.timestamp,
            dayProgress: d.dayProgress,
            hourOfDay: d.hourOfDay,
            dataPreview:
              typeof d.data === "object"
                ? JSON.stringify(d.data).slice(0, 200)
                : String(d.data).slice(0, 200),
          })),
          totalPending: count,
          showing: docs.length,
        });
      } catch (err) {
        logger.error({ err, id }, "Failed to fetch pending data");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },

  /**
   * Get buffer state for a TriggeredDrop node
   */
  "/api/datastudio/triggered-drop/state": {
    async GET(req) {
      if (!app) {
        return new Response("Application not initialized", { status: 500 });
      }

      const url = new URL(req.url);
      const id = url.searchParams.get("id");

      if (!id) {
        return new Response("Missing 'id' parameter", { status: 400 });
      }

      try {
        const runtime = app.dataStudioRuntime;
        const node = runtime.getNodeById(id);

        if (!node || !(node instanceof TriggeredDropNode)) {
          return new Response("Node not found or not a TriggeredDrop", {
            status: 404,
          });
        }

        const state = node.getBufferState();

        return Response.json({
          count: state.count,
          maxSize: state.maxSize,
          percentFull: Math.round((state.count / state.maxSize) * 100),
        });
      } catch (err) {
        logger.error({ err, id }, "Failed to fetch TriggeredDrop state");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },

  /**
   * Get state for a ScheduledTrigger node
   */
  "/api/datastudio/scheduled-trigger/state": {
    async GET(req) {
      if (!app) {
        return new Response("Application not initialized", { status: 500 });
      }

      const url = new URL(req.url);
      const id = url.searchParams.get("id");

      if (!id) {
        return new Response("Missing 'id' parameter", { status: 400 });
      }

      try {
        const runtime = app.dataStudioRuntime;
        const node = runtime.getNodeById(id);

        if (!node || !(node instanceof ScheduledTriggerNode)) {
          return new Response("Node not found or not a ScheduledTrigger", {
            status: 404,
          });
        }

        const state = node.getState();
        return Response.json(state);
      } catch (err) {
        logger.error({ err, id }, "Failed to fetch ScheduledTrigger state");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },

  /**
   * List available Imagen templates
   */
  "/api/datastudio/imagen/templates": {
    async GET() {
      try {
        const templates = await ImagenNode.listTemplates();
        return Response.json(templates);
      } catch (err) {
        logger.error({ err }, "Failed to list Imagen templates");
        return Response.json([], { status: 500 });
      }
    },
  },

  /**
   * Get schema for a specific Imagen template
   */
  "/api/datastudio/imagen/templates/:id": {
    async GET(req) {
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const templateId = pathParts[pathParts.length - 1];

      if (!templateId) {
        return new Response("Missing template ID", { status: 400 });
      }

      try {
        const schema = await ImagenNode.getTemplateSchema(templateId);
        if (!schema) {
          return Response.json(
            { error: `Template '${templateId}' not found` },
            { status: 404 },
          );
        }
        return Response.json(schema);
      } catch (err) {
        logger.error({ err, templateId }, "Failed to get template schema");
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  },

  /**
   * List available data sources/channels for SourceInput node
   */
  "/api/datastudio/sources": {
    async GET() {
      try {
        const channelIds = SourceInputNode.getAvailableSources();
        // Transform to format expected by SourceSelector component
        const sources = channelIds.map((id) => ({
          id,
          name: id,
        }));
        return Response.json({ sources });
      } catch (err) {
        logger.error({ err }, "Failed to list sources");
        return Response.json({ sources: [] }, { status: 500 });
      }
    },
  },

  /**
   * Get node settings
   * GET /api/datastudio/node-settings?nodeId=xxx
   */
  "/api/datastudio/node-settings": {
    async GET(req) {
      if (!app) {
        return new Response("Application not initialized", { status: 500 });
      }

      try {
        const url = new URL(req.url);
        const nodeId = url.searchParams.get("nodeId");

        if (!nodeId) {
          return Response.json(
            { error: "Missing 'nodeId' parameter" },
            { status: 400 },
          );
        }

        const settings = app.dataStudioRuntime.getNodeSettings(nodeId);
        if (settings === undefined) {
          return Response.json({ error: "Node not found" }, { status: 404 });
        }

        return Response.json({
          nodeId,
          settings,
        });
      } catch (err) {
        logger.error({ err }, "Failed to get node settings");
        return Response.json(
          { error: "Failed to get node settings" },
          { status: 500 },
        );
      }
    },

    /**
     * Update node settings
     * POST /api/datastudio/node-settings
     * Body: { nodeId: string, settings: { ... } }
     */
    async POST(req) {
      if (!app) {
        return new Response("Application not initialized", { status: 500 });
      }

      try {
        const body = await req.json();
        const { nodeId, settings } = body;

        if (!nodeId || typeof nodeId !== "string") {
          return Response.json(
            { error: "Missing or invalid 'nodeId' field" },
            { status: 400 },
          );
        }

        if (!settings || typeof settings !== "object") {
          return Response.json(
            { error: "Missing or invalid 'settings' field" },
            { status: 400 },
          );
        }

        app.dataStudioRuntime.updateNodeSettings(nodeId, settings);

        logger.info({ nodeId, settings }, "Node settings updated via HTTP");

        return Response.json({
          success: true,
          nodeId,
          timestamp: Date.now(),
        });
      } catch (err) {
        logger.error({ err }, "Failed to update node settings");
        return Response.json(
          { error: "Failed to update node settings" },
          { status: 500 },
        );
      }
    },
  },
});
