import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Switch (Random): Routes the signal to one random output channel.
 * Supports optional weights for non-uniform distribution.
 */
export default class SwitchNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const value = inputs.in?.value;
    const numOutputs = Math.max(
      2,
      Math.min(3, Number(this.config.outputs ?? 2)),
    );
    const weightsRaw = (this.config.weights || "").trim();

    // Parse weights or use uniform
    let weights: number[];
    if (weightsRaw) {
      weights = weightsRaw
        .split(",")
        .map((w: string) => Number(w.trim()))
        .slice(0, numOutputs);
      // Pad if not enough
      while (weights.length < numOutputs) weights.push(1);
    } else {
      weights = Array(numOutputs).fill(1);
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const roll = Math.random() * totalWeight;

    let cumulative = 0;
    let chosen = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (roll < cumulative) {
        chosen = i;
        break;
      }
    }

    // Build output — only the chosen channel gets the value
    const result: Record<string, DataPacket> = {};
    for (let i = 0; i < 3; i++) {
      const key = `out${i + 1}`;
      result[key] = new DataPacket(i === chosen ? value : null);
    }

    return result;
  }
}
