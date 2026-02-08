import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ObjDeleteNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const source = inputs.object?.value;
    if (typeof source !== "object" || source === null) {
      return {
        object: new DataPacket({}),
        deleted: new DataPacket(null),
      };
    }

    const keysRaw = (this.config.keys || "").trim();
    if (!keysRaw) {
      return {
        object: new DataPacket(JSON.parse(JSON.stringify(source))),
        deleted: new DataPacket(null),
      };
    }

    const keys = keysRaw
      .split(",")
      .map((k: string) => k.trim())
      .filter(Boolean);
    const mode = this.config.mode || "omit";
    const obj = JSON.parse(JSON.stringify(source));

    if (mode === "pick") {
      const picked: Record<string, unknown> = {};
      for (const key of keys) {
        const val = _.get(obj, key);
        if (val !== undefined) {
          _.set(picked, key, val);
        }
      }
      return {
        object: new DataPacket(picked),
        deleted: new DataPacket(null),
      };
    }

    // omit mode
    const deletedValues: Record<string, unknown> = {};
    for (const key of keys) {
      const val = _.get(obj, key);
      if (val !== undefined) {
        deletedValues[key] = val;
        _.unset(obj, key);
      }
    }

    return {
      object: new DataPacket(obj),
      deleted: new DataPacket(
        Object.keys(deletedValues).length === 1
          ? Object.values(deletedValues)[0]
          : deletedValues,
      ),
    };
  }
}
