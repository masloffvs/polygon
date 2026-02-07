import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Date Offset Node
 *
 * Converts a number offset to a date string.
 * - 0 or empty = today
 * - -1 = yesterday
 * - -2 = day before yesterday
 * - +1 = tomorrow
 * - +2 = day after tomorrow
 * etc.
 */
export class DateOffsetNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as unknown as NodeManifest;

  constructor(id: UUID, config: Record<string, unknown> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    // Get offset from input or use default
    let offset = 0;

    const inputValue = inputs.offset?.value;

    if (inputValue !== undefined && inputValue !== null) {
      if (typeof inputValue === "number") {
        offset = Math.round(inputValue); // Round to integer
      } else if (typeof inputValue === "string") {
        const parsed = parseInt(inputValue, 10);
        offset = Number.isNaN(parsed) ? 0 : parsed;
      }
      // Any other type = 0 (today)
    } else {
      // No input, use default from settings
      offset = Number(this.config.defaultOffset) || 0;
    }

    // Calculate target date
    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + offset);

    // Format as YYYY-MM-DD
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    context.logger.info(`DateOffset: ${offset} days → ${dateStr}`);

    return {
      date: new DataPacket(dateStr),
      timestamp: new DataPacket(targetDate.getTime()),
    };
  }
}

export default DateOffsetNode;
