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

export default class ExportReceiverNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;
	private unsubscribe: (() => void) | null = null;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
		logger.info(
			{ nodeId: id, config },
			"ExportReceiverNode: Initializing with config",
		);
		this.setupSubscription();
	}

	private setupSubscription() {
		const channelId = this.config.channelId;
		if (!channelId) {
			logger.warn(
				{ nodeId: this.id },
				"ExportReceiverNode: No channelId configured",
			);
			return;
		}

		// Unsubscribe if existing subscription
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}

		logger.info({ nodeId: this.id, channelId }, "ExportReceiver: Subscribing");

		// Subscribe to the channel
		this.unsubscribe = exportChannel.subscribe(
			channelId,
			(event: ExportEvent) => {
				logger.info(
					{ nodeId: this.id, channelId, symbol: event.data?.symbol },
					"ExportReceiverNode: Received Event",
				);
				// Emit data to the output port
				this.onEmit?.({
					data: new DataPacket(event.data),
				});
			},
		);
		// console.log(`[ExportReceiver] Subscribed to ${channelId}`);
	}

	public async process(
		_inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		// This node is a source (trigger), so process is mainly for configuration updates if triggered?
		// But usually sources emit via this.emit().
		// If we receive inputs (we don't have any), we do nothing.
		return {};
	}

	public async dispose() {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
	}
}
