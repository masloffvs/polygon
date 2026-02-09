import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Delay: Holds the signal for N milliseconds before passing it through.
 * Optional jitter adds ± random variation to the delay.
 */
export default class DelayNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const value = inputs.in?.value;
    const delayMs = Math.max(0, Number(this.config.delayMs ?? 1000));
    const jitter = Math.max(0, Number(this.config.jitter ?? 0));

    let actualDelay = delayMs;
    if (jitter > 0) {
      actualDelay += Math.round((Math.random() * 2 - 1) * jitter);
      actualDelay = Math.max(0, actualDelay);
    }

    if (actualDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }

    return {
      out: new DataPacket(value),
    };
  }
}
