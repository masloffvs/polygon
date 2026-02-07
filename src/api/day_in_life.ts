import { DayInLifeAgent } from "../server/layers/pipeline/agents/day_in_life";
import { logger } from "../server/utils/logger";

let agentInstance: DayInLifeAgent | null = null;

function getAgent(): DayInLifeAgent {
  if (!agentInstance) {
    agentInstance = new DayInLifeAgent();
  }
  return agentInstance;
}

export const getDayInLifeRoutes = () => ({
  "/api/day-in-life": {
    async POST(req: Request) {
      try {
        const body = await req.json();
        const { date } = body as { date?: string };

        if (!date) {
          return Response.json(
            { error: "Date is required (YYYY-MM-DD format)" },
            { status: 400 },
          );
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return Response.json(
            { error: "Invalid date format. Use YYYY-MM-DD" },
            { status: 400 },
          );
        }

        logger.info({ date }, "Day In Life API request");

        const agent = getAgent();
        const result = await agent.process(
          { date },
          {
            topic: "day-in-life-request",
            timestamp: Date.now(),
            data: { date },
          },
        );

        if (!result) {
          return Response.json(
            { error: "No data available for this date" },
            { status: 404 },
          );
        }

        return Response.json(result);
      } catch (err) {
        logger.error({ err }, "Day In Life API failed");
        return Response.json(
          { error: err instanceof Error ? err.message : "Internal error" },
          { status: 500 },
        );
      }
    },
  },
});
