import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * String Split Node
 *
 * Splits a string into an array by delimiter.
 *
 * Example:
 *   Input: "a, b, c", Delimiter: ","
 *   Output: ["a", "b", "c"]
 */
export default class StringSplitNode extends DataFlowNode {
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

    const str = String(input.value ?? "");
    const delimiter = this.config.delimiter ?? ",";
    const trim = this.config.trim !== false;
    const limit = this.config.limit || 0;

    let parts = limit > 0 ? str.split(delimiter, limit) : str.split(delimiter);

    if (trim) {
      parts = parts.map((p) => p.trim());
    }

    return {
      result: new DataPacket(parts),
      count: new DataPacket(parts.length),
    };
  }
}
