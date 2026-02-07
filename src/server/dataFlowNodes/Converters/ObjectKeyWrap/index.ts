import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Object Key Wrap Node
 *
 * Wraps any input value into an object with a configurable key.
 * Preserves the original data type (smartcast).
 *
 * Example:
 *   Input: "hello", Key: "greeting"
 *   Output: { "greeting": "hello" }
 *
 *   Input: 42, Key: "count"
 *   Output: { "count": 42 }
 */
export default class ObjectKeyWrapNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const input = inputs.data;
    if (input === undefined) return {};

    const key = this.config.key?.trim() || "data";
    const value = input.value;

    // Smartcast: preserve original type as-is
    // No conversion needed - just wrap in object
    const result = { [key]: value };

    return {
      result: new DataPacket(result),
    };
  }
}
