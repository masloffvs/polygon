import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * String Join Node
 *
 * Joins an array into a string with a delimiter.
 *
 * Example:
 *   Input: ["a", "b", "c"], Delimiter: " | "
 *   Output: "a | b | c"
 */
export default class StringJoinNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const input = inputs.data;
    if (input === undefined) return {};

    const arr = Array.isArray(input.value) ? input.value : [input.value];
    const delimiter = this.config.delimiter ?? ", ";
    const prefix = this.config.prefix ?? "";
    const suffix = this.config.suffix ?? "";

    const result = prefix + arr.join(delimiter) + suffix;

    return {
      result: new DataPacket(result),
    };
  }
}
