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
// Import shared session registry from Init
import { collectorSessions } from "../CollectorInit/index";
import manifest from "./schema.json";

/**
 * Collector Bucket: Collects results from the Init loop.
 * Sends ack feedback to Init, emits final array when all done.
 */
export default class CollectorBucketNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private localResults: unknown[] = [];
  private expectedTotal = 0;
  private sessionKey = "";

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
    const sessionId = this.config.sessionId || "default";
    this.sessionKey = `collector:${sessionId}`;
    const dropNull = this.config.dropNull === "true";

    const resultInput = inputs.result;
    const metaInput = inputs.meta?.value as
      | { sessionKey: string; index: number; total: number; isLast: boolean }
      | undefined;

    // Need both result and meta to proceed
    if (resultInput === undefined || !metaInput) {
      return {};
    }

    // Validate session key matches
    if (metaInput.sessionKey !== this.sessionKey) {
      context.logger.warn(
        `CollectorBucket: Session mismatch. Expected '${this.sessionKey}', got '${metaInput.sessionKey}'`,
      );
      return {};
    }

    const result = resultInput.value;
    const { index, total, isLast } = metaInput;

    // Initialize if first item
    if (index === 0) {
      this.localResults = [];
      this.expectedTotal = total;
    }

    // Store result (optionally skip nulls)
    if (dropNull && (result === null || result === undefined)) {
      context.logger.info(`CollectorBucket: Dropping null at index ${index}`);
    } else {
      // Store at correct index to preserve order
      this.localResults[index] = result;
    }

    context.logger.info(`CollectorBucket: Collected ${index + 1}/${total}`);

    // Check if this is the last item
    if (isLast) {
      // Clean up sparse array if dropNull was used
      const finalArray = dropNull
        ? this.localResults.filter((_, i) => this.localResults[i] !== undefined)
        : [...this.localResults];

      context.logger.info(
        `CollectorBucket: Session '${sessionId}' complete. Collected ${finalArray.length} items.`,
      );

      // Clean up session
      collectorSessions.delete(this.sessionKey);
      this.localResults = [];

      // Emit final collected array + last ack
      return {
        ack: new DataPacket({ done: true, index }),
        collected: new DataPacket(finalArray),
        count: new DataPacket(finalArray.length),
      };
    }

    // Not last — send ack to trigger next iteration
    return {
      ack: new DataPacket({ done: false, index }),
      collected: new DataPacket(null),
      count: new DataPacket(index + 1),
    };
  }

  public async dispose(): Promise<void> {
    this.localResults = [];
    this.expectedTotal = 0;
  }
}
