import { get } from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * ObjectValueLessThan Node
 * Checks if value at key path is less than threshold
 * Routes to 'passed' or 'failed' output based on condition
 */
export default class ObjectValueLessThanNode extends DataFlowNode {
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

    const data = input.value;
    const path = this.config.path?.trim() || "";
    const threshold = Number(this.config.threshold) || 0;
    const orEqual = Boolean(this.config.orEqual);

    if (!path) {
      return {
        error: new DataPacket({
          code: "MISSING_PATH",
          message: "Key path is required",
          timestamp: Date.now(),
        }),
        failed: new DataPacket(data),
      };
    }

    // Check if input is valid object
    if (data === null || data === undefined || typeof data !== "object") {
      return {
        error: new DataPacket({
          code: "INVALID_INPUT",
          message: `Input must be an object (got ${typeof data})`,
          path,
          timestamp: Date.now(),
        }),
        failed: new DataPacket(data),
      };
    }

    // Extract value using lodash
    const value = get(data, path);

    if (value === undefined) {
      return {
        error: new DataPacket({
          code: "PATH_NOT_FOUND",
          message: `Path "${path}" not found in object`,
          path,
          availableKeys: Object.keys(data).slice(0, 10),
          timestamp: Date.now(),
        }),
        failed: new DataPacket(data),
      };
    }

    // Convert to number
    const numValue = Number(value);
    if (Number.isNaN(numValue)) {
      return {
        error: new DataPacket({
          code: "NOT_A_NUMBER",
          message: `Value at "${path}" is not a number (got ${typeof value}: ${value})`,
          path,
          value,
          timestamp: Date.now(),
        }),
        failed: new DataPacket(data),
      };
    }

    // Perform comparison
    const passed = orEqual ? numValue <= threshold : numValue < threshold;

    context.logger.info("ObjectValueLessThan check", {
      path,
      value: numValue,
      threshold,
      orEqual,
      passed,
    });

    if (passed) {
      return {
        passed: new DataPacket(data),
        value: new DataPacket(numValue),
      };
    }

    return {
      failed: new DataPacket(data),
      value: new DataPacket(numValue),
    };
  }
}
