import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayGroupByNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const arrayInput = inputs.array?.value;
    if (!Array.isArray(arrayInput)) {
      return {
        groups: new DataPacket({}),
        keys: new DataPacket([]),
        count: new DataPacket(0),
      };
    }

    const groupKey = (this.config.groupKey || "").trim();
    const transform = this.config.transform || "none";
    const extractField = (this.config.extractField || "").trim();

    if (!groupKey) {
      return {
        groups: new DataPacket({}),
        keys: new DataPacket([]),
        count: new DataPacket(0),
      };
    }

    // Group elements
    const grouped: Record<string, unknown[]> = {};
    for (const el of arrayInput) {
      const keyVal = String(
        typeof el === "object" && el !== null
          ? (_.get(el, groupKey) ?? "__undefined__")
          : el,
      );
      if (!grouped[keyVal]) grouped[keyVal] = [];
      grouped[keyVal].push(el);
    }

    // Apply transform
    let result: Record<string, unknown>;

    switch (transform) {
      case "count":
        result = {};
        for (const [k, v] of Object.entries(grouped)) {
          result[k] = v.length;
        }
        break;

      case "extractField":
        result = {};
        for (const [k, v] of Object.entries(grouped)) {
          result[k] = extractField
            ? v.map((el) =>
                typeof el === "object" && el !== null
                  ? _.get(el, extractField)
                  : el,
              )
            : v;
        }
        break;

      case "none":
      default:
        result = grouped;
        break;
    }

    const keys = Object.keys(result);
    return {
      groups: new DataPacket(result),
      keys: new DataPacket(keys),
      count: new DataPacket(keys.length),
    };
  }
}
