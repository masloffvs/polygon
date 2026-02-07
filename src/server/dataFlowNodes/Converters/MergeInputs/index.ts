import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

interface PendingMerge {
  input1?: unknown;
  input2?: unknown;
  createdAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Merge Inputs Node
 *
 * Merges two async inputs into one object or array.
 * Waits for both inputs with configurable TTL (max 500 seconds).
 * Data is stored in memory until both inputs arrive or TTL expires.
 *
 * Output formats:
 *   - Object: { input1: value1, input2: value2 } (keys are configurable)
 *   - Array: [value1, value2]
 */
export default class MergeInputsNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  // In-memory storage for pending merges
  // Key: execution context ID (or node ID if no context)
  private pendingMerges: Map<string, PendingMerge> = new Map();

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const ttlSeconds = Math.min(
      Math.max(Number(this.config.ttlSeconds) || 60, 1),
      500,
    );
    const outputFormat = this.config.outputFormat || "object";
    const key1 = this.config.key1?.trim() || "input1";
    const key2 = this.config.key2?.trim() || "input2";

    // Use trace ID or fallback to node ID
    const mergeKey = context.traceId || this.id;

    // Get or create pending merge
    let pending = this.pendingMerges.get(mergeKey);

    if (!pending) {
      pending = {
        createdAt: Date.now(),
        timeoutId: setTimeout(() => {
          this.pendingMerges.delete(mergeKey);
        }, ttlSeconds * 1000),
      };
      this.pendingMerges.set(mergeKey, pending);
    }

    // Store incoming data
    if (inputs.input1 !== undefined) {
      pending.input1 = inputs.input1.value;
    }
    if (inputs.input2 !== undefined) {
      pending.input2 = inputs.input2.value;
    }

    // Check if both inputs are present
    const hasInput1 = pending.input1 !== undefined;
    const hasInput2 = pending.input2 !== undefined;

    if (hasInput1 && hasInput2) {
      // Clear timeout and remove from pending
      clearTimeout(pending.timeoutId);
      this.pendingMerges.delete(mergeKey);

      // Build output
      let result: unknown;
      if (outputFormat === "array") {
        result = [pending.input1, pending.input2];
      } else {
        result = {
          [key1]: pending.input1,
          [key2]: pending.input2,
        };
      }

      return {
        result: new DataPacket(result),
      };
    }

    // Not ready yet - return empty (no output)
    return {};
  }

  /**
   * Cleanup on node destruction
   */
  public destroy(): void {
    for (const pending of this.pendingMerges.values()) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingMerges.clear();
  }
}
