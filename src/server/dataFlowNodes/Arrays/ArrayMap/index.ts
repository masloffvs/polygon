import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayMapNode extends DataFlowNode {
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

    const mode = this.config.mode || "extractKey";
    const key = (this.config.key || "").trim();
    const wrapKey = (this.config.wrapKey || "value").trim();

    let result: unknown[];

    switch (mode) {
      case "extractKey":
        result = arrayInput.map((el: unknown) => {
          if (!key) return el;
          if (typeof el === "object" && el !== null) {
            return _.get(el, key);
          }
          return el;
        });
        break;

      case "wrap":
        result = arrayInput.map((el: unknown) => ({
          [wrapKey]: el,
        }));
        break;

      case "toString":
        result = arrayInput.map((el: unknown) =>
          typeof el === "string" ? el : JSON.stringify(el),
        );
        break;

      case "parseJson":
        result = arrayInput.map((el: unknown) => {
          if (typeof el !== "string") return el;
          try {
            return JSON.parse(el);
          } catch {
            return el;
          }
        });
        break;

      case "flatten":
        result = arrayInput
          .map((el: unknown) => (Array.isArray(el) ? el : [el]))
          .flat();
        break;

      case "indexed":
        result = arrayInput.map((el: unknown, i: number) => ({
          index: i,
          value: el,
        }));
        break;

      default:
        result = arrayInput;
    }

    return { result: new DataPacket(result) };
  }
}
