import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ObjCloneNode extends DataFlowNode {
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
      return { clone: new DataPacket({}) };
    }

    const mode = this.config.mode || "full";
    const keysRaw = (this.config.keys || "").trim();
    const keys = keysRaw
      ? keysRaw
          .split(",")
          .map((k: string) => k.trim())
          .filter(Boolean)
      : [];

    // Deep clone
    const cloned = JSON.parse(JSON.stringify(source));

    if (mode === "pick" && keys.length > 0) {
      const picked: Record<string, unknown> = {};
      for (const key of keys) {
        const val = _.get(cloned, key);
        if (val !== undefined) {
          _.set(picked, key, val);
        }
      }
      return { clone: new DataPacket(picked) };
    }

    if (mode === "omit" && keys.length > 0) {
      for (const key of keys) {
        _.unset(cloned, key);
      }
      return { clone: new DataPacket(cloned) };
    }

    return { clone: new DataPacket(cloned) };
  }
}
