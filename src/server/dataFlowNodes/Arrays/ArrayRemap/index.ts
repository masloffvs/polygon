import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayRemapNode extends DataFlowNode {
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
      return { result: new DataPacket([]) };
    }

    const pickKeysRaw = (this.config.pickKeys || "").trim();
    const renameMapRaw = (this.config.renameMap || "").trim();
    const defaultsRaw = (this.config.defaults || "").trim();
    const dropNull = this.config.dropNull === "true";

    const pickKeys = pickKeysRaw
      ? pickKeysRaw.split(",").map((k: string) => k.trim()).filter(Boolean)
      : [];

    // Parse rename map: "oldKey:newKey,oldKey2:newKey2"
    const renameMap = new Map<string, string>();
    if (renameMapRaw) {
      for (const pair of renameMapRaw.split(",")) {
        const [from, to] = pair.split(":").map((s) => s.trim());
        if (from && to) renameMap.set(from, to);
      }
    }

    // Parse defaults JSON
    let defaults: Record<string, unknown> = {};
    if (defaultsRaw) {
      try {
        defaults = JSON.parse(defaultsRaw);
      } catch {
        // ignore invalid JSON
      }
    }

    const result = arrayInput.map((el: unknown) => {
      if (typeof el !== "object" || el === null) return el;
      const src = el as Record<string, unknown>;
      const out: Record<string, unknown> = { ...defaults };

      // If pickKeys specified, only take those keys
      const keysToProcess =
        pickKeys.length > 0 ? pickKeys : Object.keys(src);

      for (const key of keysToProcess) {
        const value = _.get(src, key);
        const outKey = renameMap.get(key) || key;

        if (dropNull && (value === null || value === undefined)) {
          continue;
        }

        // Use simple key name (last segment) if it was a dot path
        const finalKey = outKey.includes(".")
          ? outKey
          : outKey;
        out[finalKey] = value;
      }

      return out;
    });

    return { result: new DataPacket(result) };
  }
}
