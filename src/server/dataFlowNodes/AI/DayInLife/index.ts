import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import { DayInLifeAgent } from "../../../layers/pipeline/agents/day_in_life";
import schema from "./schema.json";

/**
 * Day In Life Node
 *
 * Takes a date input and fetches all news for that day,
 * then sends to multiple AI models for summarization.
 */
export class DayInLifeNode extends DataFlowNode {
  public readonly manifest: NodeManifest = schema as unknown as NodeManifest;

  private agent: DayInLifeAgent;

  constructor(id: UUID, config: Record<string, unknown> = {}) {
    super(id, config);
    this.agent = new DayInLifeAgent();
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const dateInput = inputs.date?.value;

    // Validate date format
    let dateStr: string;

    if (!dateInput) {
      // Use today's date as default
      const parts = new Date().toISOString().split("T");
      dateStr = parts[0] ?? new Date().toISOString().slice(0, 10);
    } else if (typeof dateInput === "string") {
      // Validate YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        dateStr = dateInput;
      } else {
        // Try to parse as date
        const parsed = new Date(dateInput);
        if (Number.isNaN(parsed.getTime())) {
          return this.createError(
            "INVALID_DATE",
            `Invalid date format: ${dateInput}. Use YYYY-MM-DD`,
            context,
          );
        }
        const parts = parsed.toISOString().split("T");
        dateStr = parts[0] ?? parsed.toISOString().slice(0, 10);
      }
    } else if (dateInput instanceof Date) {
      const parts = dateInput.toISOString().split("T");
      dateStr = parts[0] ?? dateInput.toISOString().slice(0, 10);
    } else {
      return this.createError(
        "INVALID_INPUT",
        "Date input must be a string in YYYY-MM-DD format",
        context,
      );
    }

    context.logger.info(`Processing Day In Life for ${dateStr}`);

    try {
      const result = await this.agent.process(
        { date: dateStr },
        {
          topic: "day-in-life-request",
          timestamp: Date.now(),
          data: { date: dateStr },
        },
      );

      if (!result) {
        return this.createError(
          "NO_DATA",
          "No data returned from agent",
          context,
        );
      }

      return {
        result: new DataPacket(result),
      };
    } catch (err) {
      context.logger.error("Day In Life processing failed", err);
      return this.createError(
        "PROCESSING_ERROR",
        err instanceof Error ? err.message : "Processing failed",
        context,
      );
    }
  }

  private createError(
    code: string,
    message: string,
    context: ProcessingContext,
  ): ErrorPacket {
    return {
      code,
      message,
      nodeId: this.id,
      traceId: context.traceId || crypto.randomUUID(),
      timestamp: Date.now(),
      recoverable: true,
    };
  }
}

export default DayInLifeNode;
