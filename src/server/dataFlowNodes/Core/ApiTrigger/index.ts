import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import { triggerBus } from "../../../dataflow/TriggerBus";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * ApiTrigger Node
 *
 * Subscribes to the global TriggerBus and emits data when
 * an API request matches its trigger key.
 *
 * Usage:
 * POST /api/datastudio/trigger
 * Body: { "key": "my-trigger-key", "payload": { ... } }
 */
export default class ApiTriggerNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;
	private unsubscribe: (() => void) | null = null;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	/**
	 * Called when the node is added to the runtime graph.
	 * Subscribes to the trigger bus.
	 */
	public async initialize(): Promise<void> {
		const myKey = this.config.triggerKey || "";

		// Wait for Redis subscription to be ready
		this.unsubscribe = await triggerBus.subscribe((event) => {
			// If no key configured, receive all events
			// Otherwise, only receive events with matching key
			if (!myKey || event.key === myKey) {
				console.log(`[ApiTrigger] Node ${this.id} received event:`, event.key);
				this.emit({
					data: new DataPacket({
						key: event.key,
						payload: event.payload,
						timestamp: event.timestamp,
						triggeredAt: new Date(event.timestamp).toISOString(),
					}),
				});
			}
		});

		console.log(
			`[ApiTrigger] Node ${this.id} subscribed to trigger bus (key: "${myKey || "*"}")`,
		);
	}

	/**
	 * Process is not typically called for trigger nodes,
	 * but we implement it for completeness.
	 */
	public async process(
		_inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		// Trigger nodes don't process inputs - they emit spontaneously
		return {
			data: new DataPacket(null),
		};
	}

	/**
	 * Called when the node is removed from the runtime graph.
	 * Unsubscribes from the trigger bus.
	 */
	public async dispose(): Promise<void> {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
			console.log(`[ApiTrigger] Node ${this.id} unsubscribed from trigger bus`);
		}
	}
}
