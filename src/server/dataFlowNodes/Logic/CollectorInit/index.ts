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

// Global session registry for Collector Init <-> Bucket communication
const collectorSessions = new Map<
  string,
  {
    array: unknown[];
    currentIndex: number;
    total: number;
    initNodeId: string;
    results: unknown[];
    onFeedback?: () => void;
  }
>();

/**
 * Collector Init: Starts a map/collect operation.
 * Emits elements one by one, waits for Bucket feedback before next.
 */
export default class CollectorInitNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

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

    const arrayInput = inputs.array?.value;
    const feedbackInput = inputs.feedback;

    // CASE 1: New array input — start new session
    if (Array.isArray(arrayInput) && arrayInput.length > 0) {
      context.logger.info(
        `CollectorInit: Starting session '${sessionId}' with ${arrayInput.length} items`,
      );

      // Initialize session
      const session = {
        array: arrayInput,
        currentIndex: 0,
        total: arrayInput.length,
        initNodeId: this.id,
        results: [] as unknown[],
      };
      collectorSessions.set(this.sessionKey, session);

      // Emit first element
      return this.emitCurrentItem(session);
    }

    // CASE 2: Feedback from Bucket — advance to next item
    if (feedbackInput !== undefined) {
      const session = collectorSessions.get(this.sessionKey);
      if (!session) {
        context.logger.warn(
          `CollectorInit: No active session '${sessionId}' for feedback`,
        );
        return {};
      }

      // Move to next index
      session.currentIndex++;

      if (session.currentIndex >= session.total) {
        // All items emitted, Bucket will handle final collection
        context.logger.info(
          `CollectorInit: Session '${sessionId}' iteration complete`,
        );
        return {};
      }

      // Emit next element
      return this.emitCurrentItem(session);
    }

    // No valid input
    return {};
  }

  private emitCurrentItem(session: {
    array: unknown[];
    currentIndex: number;
    total: number;
    initNodeId: string;
  }): Record<string, DataPacket> {
    const item = session.array[session.currentIndex];
    const index = session.currentIndex;

    return {
      item: new DataPacket(item),
      index: new DataPacket(index),
      meta: new DataPacket({
        sessionKey: this.sessionKey,
        index,
        total: session.total,
        isLast: index === session.total - 1,
      }),
    };
  }

  public async dispose(): Promise<void> {
    if (this.sessionKey) {
      collectorSessions.delete(this.sessionKey);
    }
  }
}

// Export for Bucket to access
export { collectorSessions };
