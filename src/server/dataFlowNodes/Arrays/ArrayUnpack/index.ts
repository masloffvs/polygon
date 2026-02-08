import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayUnpackNode extends DataFlowNode {
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
        item0: new DataPacket(null),
        item1: new DataPacket(null),
        item2: new DataPacket(null),
        item3: new DataPacket(null),
        item4: new DataPacket(null),
        rest: new DataPacket([]),
        length: new DataPacket(0),
      };
    }

    const offset = Number(this.config.offset) || 0;
    const sliced = arrayInput.slice(offset);

    return {
      item0: new DataPacket(sliced[0] ?? null),
      item1: new DataPacket(sliced[1] ?? null),
      item2: new DataPacket(sliced[2] ?? null),
      item3: new DataPacket(sliced[3] ?? null),
      item4: new DataPacket(sliced[4] ?? null),
      rest: new DataPacket(sliced.slice(5)),
      length: new DataPacket(arrayInput.length),
    };
  }
}
