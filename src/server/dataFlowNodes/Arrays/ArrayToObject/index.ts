import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayToObjectNode extends DataFlowNode {
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
      return { object: new DataPacket({}) };
    }

    const mode = this.config.mode || "entries";
    const keyField = (this.config.keyField || "id").trim();
    const valueField = (this.config.valueField || "").trim();

    const result: Record<string, unknown> = {};

    switch (mode) {
      case "entries":
        // [[key, value], [key, value], ...]
        for (const entry of arrayInput) {
          if (Array.isArray(entry) && entry.length >= 2) {
            result[String(entry[0])] = entry[1];
          }
        }
        break;

      case "keyFromField":
        // [{id: "foo", ...}, ...] → { foo: {...}, ... }
        for (const el of arrayInput) {
          if (typeof el !== "object" || el === null) continue;
          const key = String(_.get(el, keyField) ?? "");
          if (!key) continue;
          result[key] = valueField ? _.get(el, valueField) : el;
        }
        break;

      case "indexed":
        // [a, b, c] → { "0": a, "1": b, "2": c }
        for (let i = 0; i < arrayInput.length; i++) {
          result[String(i)] = arrayInput[i];
        }
        break;

      default:
        break;
    }

    return { object: new DataPacket(result) };
  }
}
