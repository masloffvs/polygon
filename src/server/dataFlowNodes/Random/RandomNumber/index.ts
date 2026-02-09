import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Box-Muller transform for gaussian random numbers.
 */
function gaussianRandom(mean: number, stddev: number): number {
  let u1 = Math.random();
  let u2 = Math.random();
  // Avoid log(0)
  while (u1 === 0) u1 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stddev;
}

/**
 * Random Number: Generates float, int, bool, or gaussian random values.
 */
export default class RandomNumberNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const mode = this.config.mode || "float";
    const min = Number(this.config.min ?? 0);
    const max = Number(this.config.max ?? 1);
    const mean = Number(this.config.mean ?? 0);
    const stddev = Number(this.config.stddev ?? 1);

    let value: number;

    switch (mode) {
      case "float":
        value = min + Math.random() * (max - min);
        break;

      case "int":
        value = Math.floor(min + Math.random() * (max - min + 1));
        value = Math.min(value, max); // clamp
        break;

      case "bool":
        value = Math.random() < 0.5 ? 0 : 1;
        break;

      case "gaussian":
        value = gaussianRandom(mean, stddev);
        break;

      default:
        value = Math.random();
    }

    return {
      value: new DataPacket(value),
    };
  }
}
