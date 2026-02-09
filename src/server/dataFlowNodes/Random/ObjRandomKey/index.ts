import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Object Random Key: Pick one or N random keys from an object.
 */
export default class ObjRandomKeyNode extends DataFlowNode {
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
        key: new DataPacket(null),
        value: new DataPacket(null),
        entry: new DataPacket(null),
      };
    }

    const keys = Object.keys(source);
    if (keys.length === 0) {
      return {
        key: new DataPacket(null),
        value: new DataPacket(null),
        entry: new DataPacket(null),
      };
    }

    const count = Math.max(
      1,
      Math.min(keys.length, Number(this.config.count ?? 1)),
    );
    const obj = source as Record<string, unknown>;

    if (count === 1) {
      const randKey = keys[Math.floor(Math.random() * keys.length)];
      return {
        key: new DataPacket(randKey),
        value: new DataPacket(obj[randKey]),
        entry: new DataPacket({ key: randKey, value: obj[randKey] }),
      };
    }

    // Pick N unique keys — Fisher-Yates partial shuffle
    const shuffled = [...keys];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picked = shuffled.slice(0, count);

    return {
      key: new DataPacket(picked),
      value: new DataPacket(picked.map((k) => obj[k])),
      entry: new DataPacket(picked.map((k) => ({ key: k, value: obj[k] }))),
    };
  }
}
