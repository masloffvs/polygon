import { cronTabService } from "../server/services/crontab_service";

export const getCronTabRoutes = () => ({
  "/api/crontab/state": {
    async GET() {
      try {
        await cronTabService.ensureStarted();
        return Response.json({ success: true, ...cronTabService.getState() });
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
          { status: 500 },
        );
      }
    },
  },

  "/api/crontab/history": {
    async GET(req: Request) {
      try {
        await cronTabService.ensureStarted();
        const url = new URL(req.url);
        const taskId = url.searchParams.get("taskId") || undefined;
        const limit = Number(url.searchParams.get("limit") || "50");

        const history = cronTabService.getHistory(taskId, limit);
        return Response.json({ success: true, history });
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
          { status: 500 },
        );
      }
    },
  },

  "/api/crontab/tasks": {
    async POST(req: Request) {
      try {
        await cronTabService.ensureStarted();
        const body = (await req.json()) as {
          name?: string;
          schedule?: string;
          command?: string;
          enabled?: boolean;
          timeoutMs?: number;
        };

        const task = await cronTabService.createTask({
          name: body.name ?? "",
          schedule: body.schedule ?? "",
          command: body.command ?? "",
          enabled: body.enabled,
          timeoutMs: body.timeoutMs,
        });

        return Response.json({ success: true, task });
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
          { status: 400 },
        );
      }
    },

    async PUT(req: Request) {
      try {
        await cronTabService.ensureStarted();
        const body = (await req.json()) as {
          id?: string;
          name?: string;
          schedule?: string;
          command?: string;
          enabled?: boolean;
          timeoutMs?: number;
        };

        if (!body.id) {
          return Response.json(
            { success: false, error: "Missing task id" },
            { status: 400 },
          );
        }

        const task = await cronTabService.updateTask({
          id: body.id,
          name: body.name,
          schedule: body.schedule,
          command: body.command,
          enabled: body.enabled,
          timeoutMs: body.timeoutMs,
        });

        return Response.json({ success: true, task });
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
          { status: 400 },
        );
      }
    },

    async DELETE(req: Request) {
      try {
        await cronTabService.ensureStarted();
        const body = (await req.json()) as { id?: string };
        if (!body.id) {
          return Response.json(
            { success: false, error: "Missing task id" },
            { status: 400 },
          );
        }

        await cronTabService.deleteTask(body.id);
        return Response.json({ success: true });
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
          { status: 400 },
        );
      }
    },
  },

  "/api/crontab/run": {
    async POST(req: Request) {
      try {
        await cronTabService.ensureStarted();
        const body = (await req.json()) as { id?: string };
        if (!body.id) {
          return Response.json(
            { success: false, error: "Missing task id" },
            { status: 400 },
          );
        }

        const execution = await cronTabService.runTaskNow(body.id);
        return Response.json({ success: true, execution });
      } catch (err) {
        return Response.json(
          {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
          { status: 400 },
        );
      }
    },
  },
});

