import {
  StatefulNode,
  type ProcessingContext,
  type StateAdapter,
} from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Barrier (Wait All): Buffers incoming signals and releases them
 * only when ALL required inputs have arrived.
 */
export default class BarrierNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private buffer: Record<string, unknown> = {};
  private bufferTimestamp = 0;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    id: UUID,
    config: Record<string, any> = {},
    stateAdapter?: StateAdapter,
  ) {
    super(id, config, stateAdapter);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const timeoutSec = Number(this.config.timeoutSec ?? 30);
    const onTimeout = this.config.onTimeout || "release";
    const requiredChannels = ["a", "b"];
    const optionalC = inputs.c !== undefined;
    if (optionalC) requiredChannels.push("c");

    // Store arriving inputs into buffer
    for (const ch of ["a", "b", "c"]) {
      if (inputs[ch] !== undefined) {
        this.buffer[ch] = inputs[ch].value;
        if (!this.bufferTimestamp) this.bufferTimestamp = Date.now();
      }
    }

    // Check if all required inputs are filled
    const allFilled = requiredChannels.every(
      (ch) => this.buffer[ch] !== undefined,
    );

    if (allFilled) {
      const result = this.releaseBuffer();
      return result;
    }

    // Check timeout
    if (
      timeoutSec > 0 &&
      this.bufferTimestamp > 0 &&
      Date.now() - this.bufferTimestamp > timeoutSec * 1000
    ) {
      if (onTimeout === "release") {
        return this.releaseBuffer();
      }
      // drop
      this.resetBuffer();
      return {
        a: new DataPacket(null),
        b: new DataPacket(null),
        c: new DataPacket(null),
        all: new DataPacket(null),
      };
    }

    // Not ready yet — return nulls (downstream should ignore)
    return {
      a: new DataPacket(null),
      b: new DataPacket(null),
      c: new DataPacket(null),
      all: new DataPacket(null),
    };
  }

  private releaseBuffer(): Record<string, DataPacket> {
    const a = this.buffer.a ?? null;
    const b = this.buffer.b ?? null;
    const c = this.buffer.c ?? null;

    const all = { a, b, ...(c !== null ? { c } : {}) };

    this.resetBuffer();

    return {
      a: new DataPacket(a),
      b: new DataPacket(b),
      c: new DataPacket(c),
      all: new DataPacket(all),
    };
  }

  private resetBuffer() {
    this.buffer = {};
    this.bufferTimestamp = 0;
  }

  public async dispose(): Promise<void> {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.resetBuffer();
  }
}
