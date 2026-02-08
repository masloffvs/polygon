import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArraySliceNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const arrayInput = inputs.array?.value;
		if (!Array.isArray(arrayInput)) {
			return {
				result: new DataPacket([]),
				length: new DataPacket(0),
			};
		}

		const mode = this.config.mode || "firstN";
		const count = Number(this.config.count) || 5;

		let result: unknown[];

		switch (mode) {
			case "firstN":
				result = arrayInput.slice(0, count);
				break;
			case "lastN":
				result = arrayInput.slice(-count);
				break;
			case "range": {
				const start = Number(this.config.start) || 0;
				const end = Number(this.config.end) || 10;
				result = arrayInput.slice(start, end);
				break;
			}
			default:
				result = arrayInput.slice(0, count);
		}

		return {
			result: new DataPacket(result),
			length: new DataPacket(result.length),
		};
	}
}
