import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * TriggeredDrop Node
 *
 * Collects data from the "data" input port and stores it in memory.
 * When data arrives on the "trigger" port, all collected data is
 * emitted downstream as a batch array, and the buffer is cleared.
 *
 * Use cases:
 * - Collect events and process them when a certain condition is met
 * - Batch data until an external API trigger fires
 * - Aggregate data and send when user requests it
 */
export default class TriggeredDropNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	// In-memory buffer for collected data
	private buffer: any[] = [];

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	private getMaxBufferSize(): number {
		return Math.max(1, Number(this.config.maxBufferSize) || 1000);
	}

	private shouldPassEmpty(): boolean {
		return Boolean(this.config.passEmptyOnTrigger);
	}

	/**
	 * Process incoming data
	 *
	 * If data comes on "data" port → add to buffer
	 * If data comes on "trigger" port → flush buffer and emit
	 */
	public async process(
		inputs: Record<string, DataPacket>,
		context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const dataInput = inputs.data;
		const triggerInput = inputs.trigger;

		// Handle data input - add to buffer
		if (dataInput !== undefined && dataInput.value !== undefined) {
			this.addToBuffer(dataInput.value);
			context.logger.info(
				`TriggeredDrop: Buffered item, total: ${this.buffer.length}`,
			);

			// Don't emit anything yet - just collecting
			return {};
		}

		// Handle trigger input - flush buffer
		if (triggerInput !== undefined) {
			return this.flushBuffer(triggerInput.value, context);
		}

		return {};
	}

	/**
	 * Add item to buffer, respecting max size
	 */
	private addToBuffer(item: any): void {
		this.buffer.push(item);

		const maxSize = this.getMaxBufferSize();
		while (this.buffer.length > maxSize) {
			this.buffer.shift(); // Remove oldest
		}
	}

	/**
	 * Flush all buffered data and return as output
	 */
	private flushBuffer(
		triggerValue: any,
		context: ProcessingContext,
	): Record<string, DataPacket> {
		const batch = [...this.buffer];
		const count = batch.length;

		// Clear buffer
		this.buffer = [];

		context.logger.info(`TriggeredDrop: Flushed ${count} items`);

		// Check if we should emit empty arrays
		if (count === 0 && !this.shouldPassEmpty()) {
			// Only pass trigger through, no batch
			return {
				trigger: new DataPacket(triggerValue),
			};
		}

		return {
			batch: new DataPacket(batch),
			trigger: new DataPacket(triggerValue),
		};
	}

	/**
	 * Get current buffer state (for debugging/monitoring)
	 */
	public getBufferState(): { count: number; maxSize: number } {
		return {
			count: this.buffer.length,
			maxSize: this.getMaxBufferSize(),
		};
	}

	/**
	 * Clear buffer on dispose
	 */
	public async dispose(): Promise<void> {
		this.buffer = [];
	}
}
