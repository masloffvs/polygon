import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * ObjectGetKey Node
 * Extracts value from object by key path using lodash _.get()
 * Supports nested paths like 'user.name' or 'items[0].title'
 */
export default class ObjectGetKeyNode extends DataFlowNode {
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

    const data = input.value;
    const path = this.config.path?.trim() || "";
    const useDefault = Boolean(this.config.useDefault);
    const defaultValue = this.config.defaultValue ?? "";

    // Always passthrough original
    const result: Record<string, DataPacket> = {
      original: new DataPacket(data),
    };

    if (!path) {
      result.error = new DataPacket({
        code: "MISSING_PATH",
        message: "Key path is required",
        timestamp: Date.now(),
      });
      return result;
    }

    // Check if input is valid
    if (data === null || data === undefined) {
      if (useDefault) {
        result.value = new DataPacket(defaultValue);
        return result;
      }
      result.error = new DataPacket({
        code: "NULL_INPUT",
        message: "Input is null or undefined",
        path,
        timestamp: Date.now(),
      });
      return result;
    }

    if (typeof data !== "object") {
      if (useDefault) {
        result.value = new DataPacket(defaultValue);
        return result;
      }
      result.error = new DataPacket({
        code: "NOT_OBJECT",
        message: `Input is not an object (got ${typeof data})`,
        path,
        timestamp: Date.now(),
      });
      return result;
    }

    // Use lodash _.get() for path extraction
    const value = _.get(data, path);

    if (value === undefined) {
      if (useDefault) {
        result.value = new DataPacket(defaultValue);
        return result;
      }
      result.error = new DataPacket({
        code: "PATH_NOT_FOUND",
        message: `Path "${path}" not found in object`,
        path,
        availableKeys: Object.keys(data).slice(0, 10),
        timestamp: Date.now(),
      });
      return result;
    }

    result.value = new DataPacket(value);
    return result;
  }
}
