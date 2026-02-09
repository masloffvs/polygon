import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Fisher-Yates shuffle (in-place on a copy).
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Array Random: Pick one, pick N, shuffle, or random contiguous slice.
 */
export default class ArrayRandomNode extends DataFlowNode {
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
        picked: new DataPacket(null),
        rest: new DataPacket([]),
      };
    }

    const mode = this.config.mode || "pickOne";
    const count = Math.max(1, Number(this.config.count ?? 3));
    const allowDuplicates = this.config.allowDuplicates === "true";

    switch (mode) {
      case "pickOne": {
        const idx = Math.floor(Math.random() * arrayInput.length);
        const rest = [...arrayInput];
        rest.splice(idx, 1);
        return {
          picked: new DataPacket(arrayInput[idx]),
          rest: new DataPacket(rest),
        };
      }

      case "pickN": {
        if (allowDuplicates) {
          // With replacement
          const picked = Array.from({ length: count }, () =>
            arrayInput[Math.floor(Math.random() * arrayInput.length)],
          );
          return {
            picked: new DataPacket(picked),
            rest: new DataPacket(arrayInput),
          };
        }

        // Without replacement — shuffle and take first N
        const shuffled = shuffle(arrayInput);
        const n = Math.min(count, shuffled.length);
        const picked = shuffled.slice(0, n);
        const pickedSet = new Set(
          picked.map((_, i) => {
            // Track original indices
            return shuffled.indexOf(picked[i]);
          }),
        );
        // Simpler approach: just use the shuffled split
        return {
          picked: new DataPacket(picked),
          rest: new DataPacket(shuffled.slice(n)),
        };
      }

      case "shuffle": {
        const shuffled = shuffle(arrayInput);
        return {
          picked: new DataPacket(shuffled),
          rest: new DataPacket([]),
        };
      }

      case "randomSlice": {
        const n = Math.min(count, arrayInput.length);
        const maxStart = arrayInput.length - n;
        const start = Math.floor(Math.random() * (maxStart + 1));
        const sliced = arrayInput.slice(start, start + n);
        const rest = [
          ...arrayInput.slice(0, start),
          ...arrayInput.slice(start + n),
        ];
        return {
          picked: new DataPacket(sliced),
          rest: new DataPacket(rest),
        };
      }

      default:
        return {
          picked: new DataPacket(null),
          rest: new DataPacket(arrayInput),
        };
    }
  }
}
