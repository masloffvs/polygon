import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ObjToArrayNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const source = inputs.object?.value;
    if (
      typeof source !== "object" ||
      source === null ||
      Array.isArray(source)
    ) {
      return {
        array: new DataPacket([]),
        length: new DataPacket(0),
      };
    }

    const mode = this.config.mode || "values";
    const keyName = (this.config.keyName || "key").trim();
    const valueName = (this.config.valueName || "value").trim();

    let result: unknown[];

    switch (mode) {
      case "keys":
        result = Object.keys(source);
        break;

      case "entries":
        result = Object.entries(source);
        break;

      case "objects":
        result = Object.entries(source).map(([k, v]) => ({
          [keyName]: k,
          [valueName]: v,
        }));
        break;

      case "values":
      default:
        result = Object.values(source);
        break;
    }

    return {
      array: new DataPacket(result),
      length: new DataPacket(result.length),
    };
  }
}
