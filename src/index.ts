import { serve } from "bun";
import { getApiRoutes } from "./api/index";
import index from "./index.html";
import { Application } from "./server/application";
import { RuntimeEvent } from "./server/dataflow/Runtime";
import { NodeRegistry } from "./server/dataflow/registry";
import { cronTabService } from "./server/services/crontab_service";
import { logger } from "./server/utils/logger";

// Error page generator with dark minimal design (UI_DESIGN_SYSTEM compliant)
const createErrorPage = (
  title: string,
  message: string,
  details?: string,
  statusCode?: number,
) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Polygon</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #eaeaea;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      padding: 1rem;
    }
    .container {
      text-align: left;
      padding: 1.5rem;
      background: #141414;
      border-radius: 12px;
      border: 1px dashed rgba(255,255,255,0.12);
      max-width: 600px;
      width: 100%;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #242424;
    }
    .status-code {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border-radius: 4px;
      font-weight: 500;
    }
    h1 {
      color: #f87171;
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }
    .message {
      color: #a0a0a0;
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 1rem;
    }
    .details {
      background: #0f0f0f;
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #1b1b1b;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.8rem;
      line-height: 1.6;
      color: #9ca3af;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      margin-bottom: 1rem;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
    }
    .btn {
      padding: 0.5rem 1rem;
      background: #1b1b1b;
      border: 1px solid #2e2e2e;
      color: #e5e5e5;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
      transition: background 0.15s;
    }
    .btn:hover { background: #242424; }
    .btn-primary {
      background: #2e2e2e;
      border-color: #3a3a3a;
    }
    .btn-primary:hover { background: #3a3a3a; }
    .meta {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #1b1b1b;
      font-size: 0.7rem;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${statusCode ? `<span class="status-code">${statusCode}</span>` : ""}
      <h1>${title}</h1>
    </div>
    <p class="message">${message}</p>
    ${details ? `<div class="details">${details}</div>` : ""}
    <div class="actions">
      <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      <button class="btn" onclick="location.href='/'">Dashboard</button>
    </div>
    <div class="meta">Polygon System • ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;

// Fallback error page when frontend fails to load
const errorFallbackHTML = createErrorPage(
  "Application Unavailable",
  "The frontend is currently unavailable. This can happen during deployment or if there is a build error.",
  "Service temporarily offline. The server is running but the UI bundle failed to load.",
  503,
);

// --- BACKEND: DATA AGGREGATION SYSTEM ---
const app = new Application();
void app.start().catch((err) => {
  logger.error({ err }, "Application bootstrap failed");
});
void cronTabService.start();

// Data Studio Socket Broadcaster
const dataStudioClients = new Set<any>();

Object.values(RuntimeEvent).forEach((evt) => {
  app.dataStudioRuntime.on(evt, (payload) => {
    const msg = JSON.stringify({
      type: "datastudio:event",
      event: evt,
      payload,
    });
    for (const client of dataStudioClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      } else {
        dataStudioClients.delete(client);
      }
    }
  });
});

// --- STREAM GATEWAY (WebSocket Aggregator) ---
const gateway = serve<{ subscription: any }>({
  hostname: "0.0.0.0",
  port: 3001,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: { subscription: null } })) {
        return;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    return new Response("Stream Gateway Active", { status: 200 });
  },
  websocket: {
    open(ws) {
      // Define a whitelist of topics allowed to reach the frontend
      // This prevents high-frequency backend streams (like raw orderbooks or full trade feeds)
      // from flooding the WebSocket connection and killing frontend FPS.
      const ALLOWED_TOPICS = new Set([
        "polymarket-snapshot-source", // Snapshot from ClickHouse for Activity page
        "polymarket-filtered-1k", // Filtered high-value trades
        "polymarket-metrics", // Aggregate metrics (TPS/Volume)
        "oklink-source", // NFT Transfers
        "polygon-processed-events", // Smart contract events
        "fear-greed-card", // Widget updates (if pushed)
        "crypto-treasuries-card", // Widget updates
        "crypto-prediction-card", // Widget updates
        "gamma-markets-card", // Widget updates
        "market-snapshot-card", // Widget updates
        "penny-whale-card", // Widget updates
        "traffic-511in-card", // Widget updates
        "whale-monitor-card", // Widget updates
        "world-clock-card", // Widget updates
      ]);

      const sub = app.feed$.subscribe((event) => {
        // Strict filtering: Only allow listed topics
        if (ALLOWED_TOPICS.has(event.pool)) {
          ws.send(JSON.stringify(event));
        }
      });
      ws.data.subscription = sub;
      logger.info("Client connected to Gateway");
    },
    async message(ws, message) {
      try {
        const str = typeof message === "string" ? message : "";
        if (!str) return;

        const data = JSON.parse(str);
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: data.ts }));
        }

        // Data Studio Handlers
        if (data.type === "datastudio:subscribe") {
          dataStudioClients.add(ws);
        } else if (data.type === "datastudio:get-status") {
          ws.send(
            JSON.stringify({
              type: "datastudio:status",
              isRunning: app.dataStudioRuntime.isActive,
            }),
          );
        } else if (data.type === "datastudio:get-graph") {
          const graph = app.dataStudioRuntime.getGraph();
          if (graph) {
            ws.send(JSON.stringify({ type: "datastudio:graph", graph }));
          }
        } else if (data.type === "datastudio:get-library") {
          const registry = NodeRegistry.getInstance();
          const library = registry.getManifests();
          ws.send(JSON.stringify({ type: "datastudio:library", library }));
        } else if (data.type === "datastudio:deploy") {
          app.dataStudioRuntime.load(data.graph).catch((err) => {
            ws.send(
              JSON.stringify({
                type: "datastudio:error",
                message: err.message,
              }),
            );
          });
        } else if (data.type === "datastudio:run") {
          app.dataStudioRuntime.run(data.options).catch((err) => {
            ws.send(
              JSON.stringify({
                type: "datastudio:error",
                message: err.message,
              }),
            );
          });
        } else if (data.type === "datastudio:stop") {
          app.dataStudioRuntime.stop();
        } else if (data.type === "datastudio:update-node-settings") {
          // Update node settings from external view (e.g. RichStringView)
          const { nodeId, settings } = data;
          if (nodeId && settings) {
            app.dataStudioRuntime.updateNodeSettings(nodeId, settings);
            // Broadcast updated graph to all clients
            const graph = app.dataStudioRuntime.getGraph();
            if (graph) {
              for (const client of dataStudioClients) {
                client.send(
                  JSON.stringify({ type: "datastudio:graph", graph }),
                );
              }
            }
            ws.send(
              JSON.stringify({ type: "datastudio:settings-updated", nodeId }),
            );
          }
        }
      } catch {}
    },
    close(ws) {
      logger.info("Client disconnected from Gateway");
      if (ws.data.subscription) {
        ws.data.subscription.unsubscribe();
      }
      dataStudioClients.delete(ws);
    },
  },
});

// --- FRONTEND: WEB SERVER ---
const webServer = serve({
  hostname: "0.0.0.0",
  port: 3000,
  // Handle build/bundle errors
  error(error) {
    logger.error({ err: error, stack: error.stack }, "Build/Request error");
    const errorDetails =
      error.stack || error.message || "Unknown error occurred";
    return new Response(
      createErrorPage(
        "Build Error",
        "The frontend failed to compile. See the error details below.",
        errorDetails,
        500,
      ),
      {
        status: 500,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  },
  routes: {
    ...getApiRoutes(app),

    // Frontend catch-all - Bun's HTMLBundle serves the SPA
    // The error() handler above catches build failures
    // The errorFallbackHTML is used when index module fails to load
    "/*":
      index ??
      new Response(errorFallbackHTML, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
  },
  // development: true,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
  },
});

logger.info(
  {
    web: `http://localhost:${webServer.port}`,
    gateway: `ws://localhost:${gateway.port}/ws`,
  },
  "Unified System Started",
);
