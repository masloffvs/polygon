import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Regex Match Node
 *
 * Extracts data from a string using a regular expression.
 *
 * Example:
 *   Input: "Hello 123 World 456"
 *   Pattern: "(\d+)"
 *   Flags: "g"
 *   Output: { match: "123", groups: ["123"], all: ["123", "456"], found: true }
 */
export default class RegexMatchNode extends DataFlowNode {
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
    const flags = this.config.flags || "";

    if (!pattern) {
      return {
        match: new DataPacket(null),
        groups: new DataPacket([]),
        all: new DataPacket([]),
        found: new DataPacket(false),
      };
    }

    try {
      const regex = new RegExp(pattern, flags);

      // First match for groups
      const firstMatch = str.match(new RegExp(pattern, flags.replace("g", "")));
      const match = firstMatch ? firstMatch[0] : null;
      const groups = firstMatch ? firstMatch.slice(1) : [];

      // All matches if global
      const allMatches = flags.includes("g")
        ? [...str.matchAll(regex)].map((m) => m[0])
        : match
          ? [match]
          : [];

      return {
        match: new DataPacket(match),
        groups: new DataPacket(groups),
        all: new DataPacket(allMatches),
        found: new DataPacket(match !== null),
      };
    } catch (err: any) {
      return {
        match: new DataPacket(null),
        groups: new DataPacket([]),
        all: new DataPacket([]),
        found: new DataPacket(false),
      };
    }
  }
}
