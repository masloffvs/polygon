import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

const HEX_CHARS = "0123456789abcdef";
const ALPHANUM_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const NUMERIC_CHARS = "0123456789";

function randomString(chars: string, length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function uuidV4(): string {
  // RFC 4122 v4 UUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Random ID: Generates UUID, hex, alphanumeric, or numeric strings.
 */
export default class RandomIdNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const mode = this.config.mode || "uuid";
    const length = Math.max(1, Number(this.config.length ?? 16));
    const prefix = this.config.prefix || "";

    let id: string;

    switch (mode) {
      case "uuid":
        id = uuidV4();
        break;

      case "hex":
        id = randomString(HEX_CHARS, length);
        break;

      case "alphanum":
        id = randomString(ALPHANUM_CHARS, length);
        break;

      case "numeric":
        id = randomString(NUMERIC_CHARS, length);
        break;

      default:
        id = uuidV4();
    }

    return {
      id: new DataPacket(prefix + id),
    };
  }
}
