import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ClockNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;
	private timer: Timer | null = null; // Bun Timer type or NodeJS.Timeout

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		_inputs: Record<string, DataPacket>,
		context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const interval = this.config.interval || 1000;

		// Clear existing timer if any
		if (this.timer) {
			clearInterval(this.timer);
		}

		context.logger.info("Starting Clock Node", { interval });

		this.timer = setInterval(() => {
			const now = new Date().toISOString();
			this.emit({
				output: new DataPacket(now),
			});
		}, interval);

		// Return immediate value (first tick)
		return {
			output: new DataPacket(new Date().toISOString()),
		};
	}

	public async dispose(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
