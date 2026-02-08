import { get, has } from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * ObjectValueEquals Node
 * Checks if value at key path equals expected value
 * Supports string, number, and boolean comparison
 */
export default class ObjectValueEqualsNode extends DataFlowNode {
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
    const expectedValue = this.config.expectedValue;
    const compareType = this.config.compareType || "string";
    const caseSensitive = this.config.caseSensitive !== false;

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

    // Perform comparison based on type
    let passed = false;

    try {
      switch (compareType) {
        case "number": {
          const numValue = Number(value);
          const numExpected = Number(expectedValue);
          passed = !Number.isNaN(numValue) && numValue === numExpected;
          break;
        }
        case "boolean": {
          const boolValue = Boolean(value);
          const boolExpected = expectedValue === "true" || expectedValue === true;
          passed = boolValue === boolExpected;
          break;
        }
        case "string":
        default: {
          const strValue = String(value);
          const strExpected = String(expectedValue);
          passed = caseSensitive
            ? strValue === strExpected
            : strValue.toLowerCase() === strExpected.toLowerCase();
          break;
        }
      }
    } catch (err) {
      context.logger.error("ObjectValueEquals comparison error", err);
      return {
        error: new DataPacket({
          code: "COMPARISON_ERROR",
          message: `Failed to compare values: ${err}`,
          path,
          value,
          expectedValue,
          timestamp: Date.now(),
        }),
        failed: new DataPacket(data),
      };
    }

    context.logger.info("ObjectValueEquals check", {
      path,
      value,
      expectedValue,
      compareType,
      caseSensitive,
      passed,
    });

    if (passed) {
      return {
        passed: new DataPacket(data),
        value: new DataPacket(value),
      };
    }

    return {
      failed: new DataPacket(data),
      value: new DataPacket(value),
    };
  }
}
