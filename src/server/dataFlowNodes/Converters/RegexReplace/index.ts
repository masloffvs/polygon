import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Regex Replace Node
 *
 * Replaces text in a string using a regular expression.
 *
 * Example:
 *   Input: "Hello World"
 *   Pattern: "(\w+)"
 *   Replacement: "[$1]"
 *   Flags: "g"
 *   Output: "[Hello] [World]"
 */
export default class RegexReplaceNode extends DataFlowNode {
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
    const pattern = this.config.pattern || "";
    const replacement = this.config.replacement ?? "";
    const flags = this.config.flags || "";

    if (!pattern) {
      return {
        result: new DataPacket(str),
        count: new DataPacket(0),
      };
    }

    try {
      const regex = new RegExp(pattern, flags);

      // Count matches before replace
      const matches = str.match(regex);
      const count = matches ? matches.length : 0;

      const result = str.replace(regex, replacement);

      return {
        result: new DataPacket(result),
        count: new DataPacket(count),
      };
    } catch (err: any) {
      return {
        result: new DataPacket(str),
        count: new DataPacket(0),
      };
    }
  }
}
