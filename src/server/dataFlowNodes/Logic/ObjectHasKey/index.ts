import { has, get } from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * ObjectHasKey Node
 * Checks if object has specified key path
 * Routes to 'passed' or 'failed' output based on key existence
 */
export default class ObjectHasKeyNode extends DataFlowNode {
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
    const checkNotNull = Boolean(this.config.checkNotNull);

    if (!path) {
      return {
        failed: new DataPacket(data),
      };
    }

    // Check if input is valid object
    if (data === null || data === undefined || typeof data !== "object") {
      return {
        failed: new DataPacket(data),
      };
    }

    // Check if path exists using lodash
    const hasPath = has(data, path);

    if (!hasPath) {
      context.logger.info("ObjectHasKey: path not found", {
        path,
        availableKeys: Object.keys(data).slice(0, 10),
      });
      return {
        failed: new DataPacket(data),
      };
    }

    // Get value
    const value = get(data, path);

    // If checkNotNull is enabled, also verify value is not null/undefined
    if (checkNotNull && (value === null || value === undefined)) {
      context.logger.info("ObjectHasKey: value is null/undefined", {
        path,
        value,
      });
      return {
        failed: new DataPacket(data),
      };
    }

    context.logger.info("ObjectHasKey: passed", {
      path,
      value,
      checkNotNull,
    });

    return {
      passed: new DataPacket(data),
      value: new DataPacket(value),
    };
  }
}
