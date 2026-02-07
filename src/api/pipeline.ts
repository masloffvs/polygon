import { get } from "lodash-es";
import type { Application } from "../server/application";
import { exportChannel } from "../server/services/exportChannel";

export const getPipelineRoutes = (app: Application) => ({
  "/api/pipeline/graph": {
    async GET() {
      return Response.json(app.getGraph());
    },
  },

  "/api/pipeline/export-channels": {
    async GET() {
      return Response.json(exportChannel.getChannels());
    },
  },

  "/api/observable/snapshots": {
    async GET(request: Request) {
      const url = new URL(request.url);
      const keysParam = url.searchParams.get("keys");

      const snapshots = app.getSnapshots();

      // No keys specified - return all
      if (!keysParam) {
        return Response.json(snapshots);
      }

      // Parse comma-separated keys
      const keys = keysParam.split(",").map((k) => k.trim());

      // Single key - return just the value
      if (keys.length === 1) {
        const key = keys[0];
        if (key === undefined) {
          return Response.json(null);
        }
        return Response.json(get(snapshots, key) ?? null);
      }

      // Multiple keys - return { "path": value } object
      const result: Record<string, any> = {};
      for (const key of keys) {
        result[key] = get(snapshots, key) ?? null;
      }
      return Response.json(result);
    },
  },
});
