import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Split (1→3): Duplicates the input signal to all three outputs.
 */
export default class SplitNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const value = inputs.in?.value;
    const deepCopy = this.config.deepCopy !== "false";

    const copy = (v: unknown): unknown => {
      if (!deepCopy) return v;
      if (v === null || v === undefined) return v;
      if (typeof v !== "object") return v;
      try {
        return JSON.parse(JSON.stringify(v));
      } catch {
        return v;
      }
    };

    return {
      out1: new DataPacket(copy(value)),
      out2: new DataPacket(copy(value)),
      out3: new DataPacket(copy(value)),
    };
  }
}
