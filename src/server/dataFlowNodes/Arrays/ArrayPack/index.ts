import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayPackNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const skipNull = this.config.skipNull !== "false";
    const ports = [
      "item0",
      "item1",
      "item2",
      "item3",
      "item4",
      "item5",
      "item6",
      "item7",
    ];

    const result: unknown[] = [];

    for (const port of ports) {
      const packet = inputs[port];
      if (packet === undefined) {
        if (!skipNull) result.push(null);
        continue;
      }
      const val = packet.value;
      if (skipNull && (val === null || val === undefined)) continue;
      result.push(val);
    }

    return {
      array: new DataPacket(result),
      length: new DataPacket(result.length),
    };
  }
}
