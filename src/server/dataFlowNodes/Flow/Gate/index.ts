import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Gate (Chance): Passes the signal with X% probability.
 * Dropped signals go to the 'dropped' output.
 */
export default class GateNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const value = inputs.in?.value;
    const chance = Math.max(0, Math.min(1, Number(this.config.chance ?? 0.5)));

    const roll = Math.random();

    if (roll < chance) {
      // Passed
      return {
        passed: new DataPacket(value),
        dropped: new DataPacket(null),
      };
    }

    // Dropped
    return {
      passed: new DataPacket(null),
      dropped: new DataPacket(value),
    };
  }
}
