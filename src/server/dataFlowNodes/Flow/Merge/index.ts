import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Merge (3→1): Any incoming signal passes through to a single output.
 */
export default class MergeNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const priority = this.config.priority || "first";
    const channels = ["in1", "in2", "in3"];

    if (priority === "all") {
      // Collect all available inputs into an array
      const values: unknown[] = [];
      const sources: string[] = [];
      for (const ch of channels) {
        if (inputs[ch] !== undefined) {
          values.push(inputs[ch].value);
          sources.push(ch);
        }
      }
      return {
        out: new DataPacket(values.length === 1 ? values[0] : values),
        source: new DataPacket(sources.join(",")),
      };
    }

    // first or last — pick one
    const order = priority === "last" ? [...channels].reverse() : channels;
    for (const ch of order) {
      if (inputs[ch] !== undefined) {
        return {
          out: new DataPacket(inputs[ch].value),
          source: new DataPacket(ch),
        };
      }
    }

    return {
      out: new DataPacket(null),
      source: new DataPacket("none"),
    };
  }
}
