import {
  type ProcessingContext,
  type StateAdapter,
  StatefulNode,
} from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * Accumulator: Collects N signals into a buffer, then emits them all as one batch.
 * Optionally auto-flushes after a timeout even if batch isn't full.
 */
export default class AccumulatorNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private buffer: unknown[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

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
    const value = inputs.in?.value;
    const batchSize = Math.max(1, Number(this.config.batchSize ?? 10));
    const flushOnTimeout = this.config.flushOnTimeout === "true";
    const flushTimeoutMs = Number(this.config.flushTimeoutMs ?? 10000);

    // Add to buffer
    this.buffer.push(value);

    // Reset auto-flush timer
    if (flushOnTimeout) {
      this.clearFlushTimer();
      this.flushTimer = setTimeout(() => {
        if (this.buffer.length > 0) {
          const batch = [...this.buffer];
          this.buffer = [];
          this.emit({
            batch: new DataPacket(batch),
            count: new DataPacket(batch.length),
          });
        }
      }, flushTimeoutMs);
    }

    // Check if batch is full
    if (this.buffer.length >= batchSize) {
      this.clearFlushTimer();
      const batch = [...this.buffer];
      this.buffer = [];

      return {
        batch: new DataPacket(batch),
        count: new DataPacket(batch.length),
      };
    }

    // Not full yet
    return {
      batch: new DataPacket(null),
      count: new DataPacket(this.buffer.length),
    };
  }

  private clearFlushTimer() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  public async dispose(): Promise<void> {
    this.clearFlushTimer();
    this.buffer = [];
  }
}
