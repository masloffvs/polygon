import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import { getRedis } from "../../../utils/redis";
import manifest from "./schema.json";

export default class TableViz extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
		this.restoreState();
	}

	private async restoreState() {
		try {
			const redis = getRedis();
			const key = `node:${this.id}:memo`;
			const data = await redis.get(key);
			// We don't really need TTL for the UI restoration of a visual node, but we'll fetch it if needed.
			// For this node, we just want to emit the stored value so the UI gets it via websocket on connect if possible,
			// but purely UI restoration is handled by the API call in the renderer.
			// However, emitting it here ensures downstream nodes also get the restored values if the graph restarts.

			if (data) {
				const parsed = JSON.parse(data);
				this.emit({
					data: new DataPacket({
						value: parsed,
						restored: true,
						timestamp: Date.now(),
					}),
				});
			}
		} catch (err) {
			console.error("Failed to restore Redis state for TableViz", err);
		}
	}

	public async process(
		inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const data = inputs.data?.value;

		if (data === undefined) return {};

		const redis = getRedis();
		const key = `node:${this.id}:memo`;
		const TTL = 3 * 24 * 60 * 60; // 3 days retention for the view

		// Store raw data to Redis
		await redis.set(key, JSON.stringify(data), "EX", TTL);

		return {
			data: new DataPacket(data),
		};
	}
}
