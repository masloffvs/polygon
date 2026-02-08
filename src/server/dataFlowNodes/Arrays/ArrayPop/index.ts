import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayPopNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const arrayInput = inputs.array?.value;
    if (!Array.isArray(arrayInput) || arrayInput.length === 0) {
      return {
        item: new DataPacket(null),
        rest: new DataPacket([]),
        length: new DataPacket(0),
      };
    }

    const arr = [...arrayInput];
    const position = this.config.position || "end";
    const item = position === "start" ? arr.shift() : arr.pop();

    return {
      item: new DataPacket(item),
      rest: new DataPacket(arr),
      length: new DataPacket(arr.length),
    };
  }
}
