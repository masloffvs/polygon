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
 * ForEach: Iterates over an array and emits each element.
 * Uses onEmit for async element emission.
 */
export default class ForEachNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private isIterating = false;

  constructor(
    id: UUID,
    config: Record<string, any> = {},
    stateAdapter?: StateAdapter,
  ) {
    super(id, config, stateAdapter);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const arrayInput = inputs.array?.value;

    if (!Array.isArray(arrayInput)) {
      return {
        item: new DataPacket(null),
        index: new DataPacket(-1),
        isFirst: new DataPacket(false),
        isLast: new DataPacket(false),
        done: new DataPacket(null),
      };
    }

    if (arrayInput.length === 0) {
      const emitDone = this.config.emitDone !== "false";
      return {
        item: new DataPacket(null),
        index: new DataPacket(-1),
        isFirst: new DataPacket(false),
        isLast: new DataPacket(false),
        done: emitDone
          ? new DataPacket({ count: 0, array: [] })
          : new DataPacket(null),
      };
    }

    // Prevent re-entry while iterating
    if (this.isIterating) {
      context.logger.warn("ForEach: Already iterating, ignoring new input");
      return {};
    }

    this.isIterating = true;
    const delayMs = Math.max(0, Number(this.config.delayMs ?? 0));
    const emitDone = this.config.emitDone !== "false";
    const len = arrayInput.length;

    // Emit first element synchronously
    const firstResult: Record<string, DataPacket> = {
      item: new DataPacket(arrayInput[0]),
      index: new DataPacket(0),
      isFirst: new DataPacket(true),
      isLast: new DataPacket(len === 1),
      done: new DataPacket(null),
    };

    // Emit remaining elements asynchronously
    if (len > 1) {
      this.emitRemaining(arrayInput, delayMs, emitDone, context);
    } else if (emitDone) {
      // Single element — emit done immediately after
      setTimeout(() => {
        this.emit({
          item: new DataPacket(null),
          index: new DataPacket(-1),
          isFirst: new DataPacket(false),
          isLast: new DataPacket(false),
          done: new DataPacket({ count: len, array: arrayInput }),
        });
        this.isIterating = false;
      }, delayMs || 1);
    } else {
      this.isIterating = false;
    }

    return firstResult;
  }

  private async emitRemaining(
    array: unknown[],
    delayMs: number,
    emitDone: boolean,
    context: ProcessingContext,
  ) {
    const len = array.length;

    for (let i = 1; i < len; i++) {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      this.emit({
        item: new DataPacket(array[i]),
        index: new DataPacket(i),
        isFirst: new DataPacket(false),
        isLast: new DataPacket(i === len - 1),
        done: new DataPacket(null),
      });
    }

    // Emit done signal
    if (emitDone) {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      this.emit({
        item: new DataPacket(null),
        index: new DataPacket(-1),
        isFirst: new DataPacket(false),
        isLast: new DataPacket(false),
        done: new DataPacket({ count: len, array }),
      });
    }

    this.isIterating = false;
    context.logger.info(`ForEach: Completed ${len} iterations`);
  }

  public async dispose(): Promise<void> {
    this.isIterating = false;
  }
}
