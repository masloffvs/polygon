import {
  type ProcessingContext,
  type StateAdapter,
  StatefulNode,
} from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Throttle: Passes at most 1 signal per interval.
 * Extra signals within the window are routed to 'dropped'.
 */
export default class ThrottleNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private lastPassedAt = 0;

  constructor(
    id: UUID,
    config: Record<string, any> = {},
    stateAdapter?: StateAdapter,
  ) {
    super(id, config, stateAdapter);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const value = inputs.in?.value;
    const intervalMs = Math.max(1, Number(this.config.intervalMs ?? 1000));
    const now = Date.now();

    if (now - this.lastPassedAt >= intervalMs) {
      this.lastPassedAt = now;
      return {
        out: new DataPacket(value),
        dropped: new DataPacket(null),
      };
    }

    // Within throttle window — drop
    return {
      out: new DataPacket(null),
      dropped: new DataPacket(value),
    };
  }

  public async dispose(): Promise<void> {
    this.lastPassedAt = 0;
  }
}
