import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayPushNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const arrayInput = inputs.array?.value;
    const item = inputs.item?.value;

    const arr = Array.isArray(arrayInput) ? [...arrayInput] : [];
    const position = this.config.position || "end";

    if (item !== undefined) {
      if (position === "start") {
        arr.unshift(item);
      } else {
        arr.push(item);
      }
    }

    return {
      result: new DataPacket(arr),
      length: new DataPacket(arr.length),
    };
  }
}
