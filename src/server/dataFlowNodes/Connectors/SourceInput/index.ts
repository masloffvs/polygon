import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import {
  type ExportEvent,
  exportChannel,
} from "../../../services/exportChannel";
import { logger } from "../../../utils/logger";
import manifest from "./schema.json";

/**
 * Source Input Node
 *
 * A connector that subscribes to any registered data source/channel
 * and emits the data to DataStudio graph.
 *
 * This is essentially a UI-friendly version of ExportReceiver
 * with a dropdown selector for available sources.
 */
export default class SourceInputNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;
  private unsubscribe: (() => void) | null = null;

  constructor(id: UUID, config: Record<string, unknown> = {}) {
    super(id, config);
    logger.info({ nodeId: id, config }, "SourceInputNode: Initializing");
    this.setupSubscription();
  }

  /**
   * Get list of available source channels
   * This is called by the UI to populate the dropdown
   */
  public static getAvailableSources(): string[] {
    return exportChannel.getChannels();
  }

  private setupSubscription() {
    const sourceId = this.config.sourceId as string;
    if (!sourceId) {
      logger.warn(
        { nodeId: this.id },
        "SourceInputNode: No sourceId configured",
      );
      return;
    }

    // Unsubscribe from previous channel if any
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    logger.info({ nodeId: this.id, sourceId }, "SourceInputNode: Subscribing");

    // Subscribe to the channel
    this.unsubscribe = exportChannel.subscribe(
      sourceId,
      (event: ExportEvent) => {
        logger.debug(
          { nodeId: this.id, sourceId, hasData: !!event.data },
          "SourceInputNode: Received data",
        );

        // Emit data to the output port
        this.onEmit?.({
          data: new DataPacket(event.data),
        });
      },
    );
  }

  /**
   * Called when config changes (e.g., user selects different source)
   */
  public updateConfig(newConfig: Record<string, unknown>) {
    const oldSourceId = this.config.sourceId;
    this.config = { ...this.config, ...newConfig };

    // If sourceId changed, re-subscribe
    if (newConfig.sourceId && newConfig.sourceId !== oldSourceId) {
      this.setupSubscription();
    }
  }

  public async process(
    _inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    // Source nodes don't process inputs - they emit spontaneously
    return {};
  }

  public override async dispose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    logger.info({ nodeId: this.id }, "SourceInputNode: Disposed");
  }
}
