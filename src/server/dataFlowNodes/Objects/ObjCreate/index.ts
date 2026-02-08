import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ObjCreateNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const skipEmpty = this.config.skipEmpty !== "false";
		const result: Record<string, unknown> = {};

		const slots = [
			{ key: this.config.key1, port: "value1" },
			{ key: this.config.key2, port: "value2" },
			{ key: this.config.key3, port: "value3" },
			{ key: this.config.key4, port: "value4" },
			{ key: this.config.key5, port: "value5" },
			{ key: this.config.key6, port: "value6" },
		];

		for (const slot of slots) {
			const key = (slot.key || "").trim();
			if (!key) {
				if (skipEmpty) continue;
			}
			if (key && inputs[slot.port] !== undefined) {
				result[key] = inputs[slot.port]?.value;
			}
		}

		return { object: new DataPacket(result) };
	}
}
