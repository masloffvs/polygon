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
 * Debounce: Emits only after the input goes silent for X ms.
 * Every new signal resets the timer. Only the LAST value is emitted.
 */
export default class DebounceNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastValue: unknown = null;

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
    const waitMs = Math.max(1, Number(this.config.waitMs ?? 500));

    this.lastValue = value;

    // Clear previous timer
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Set new timer — after quiet period, emit via onEmit callback
    this.timer = setTimeout(() => {
      this.emit({
        out: new DataPacket(this.lastValue),
      });
      this.lastValue = null;
      this.timer = null;
    }, waitMs);

    // Return null for now — real output comes via onEmit
    return {
      out: new DataPacket(null),
    };
  }

  public async dispose(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.lastValue = null;
  }
}
