import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import { getRedis } from "../../../utils/redis";
import manifest from "./schema.json";

export default class RedisMemo extends DataFlowNode {
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
			const ttl = await redis.ttl(key);

			if (data) {
				const parsed = JSON.parse(data);
				this.emit({
					stored: new DataPacket({
						value: parsed,
						ttl,
						restored: true,
						timestamp: Date.now(),
					}),
				});
			}
		} catch (err) {
			console.error("Failed to restore Redis state", err);
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
		const TTL = 3 * 24 * 60 * 60; // 3 days

		await redis.set(key, JSON.stringify(data), "EX", TTL);
		const currentTtl = await redis.ttl(key);

		return {
			stored: new DataPacket({
				value: data,
				ttl: currentTtl,
				restored: false,
				timestamp: Date.now(),
			}),
		};
	}
}
