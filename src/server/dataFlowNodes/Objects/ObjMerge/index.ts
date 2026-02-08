import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  concatArrays: boolean,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const tVal = result[key];
    const sVal = source[key];

    if (
      typeof tVal === "object" &&
      tVal !== null &&
      !Array.isArray(tVal) &&
      typeof sVal === "object" &&
      sVal !== null &&
      !Array.isArray(sVal)
    ) {
      result[key] = deepMerge(
        tVal as Record<string, unknown>,
        sVal as Record<string, unknown>,
        concatArrays,
      );
    } else if (concatArrays && Array.isArray(tVal) && Array.isArray(sVal)) {
      result[key] = [...tVal, ...sVal];
    } else {
      result[key] = sVal;
    }
  }
  return result;
}

export default class ObjMergeNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const strategy = this.config.strategy || "deep";
    const objects: Record<string, unknown>[] = [];

    for (const port of ["obj1", "obj2", "obj3", "obj4"]) {
      const val = inputs[port]?.value;
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        objects.push(val as Record<string, unknown>);
      }
    }

    if (objects.length === 0) {
      return { merged: new DataPacket({}) };
    }

    let result: Record<string, unknown>;

    switch (strategy) {
      case "shallow":
        result = Object.assign({}, ...objects);
        break;

      case "deepConcat":
        result = objects.reduce(
          (acc, obj) => deepMerge(acc, obj, true),
          {} as Record<string, unknown>,
        );
        break;

      case "deep":
      default:
        result = objects.reduce(
          (acc, obj) => deepMerge(acc, obj, false),
          {} as Record<string, unknown>,
        );
        break;
    }

    return { merged: new DataPacket(result) };
  }
}
