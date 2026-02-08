import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayConcatNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const toArray = (v: unknown): unknown[] => {
			if (Array.isArray(v)) return v;
			if (v !== undefined && v !== null) return [v];
			return [];
		};

		let result = [
			...toArray(inputs.a?.value),
			...toArray(inputs.b?.value),
			...toArray(inputs.c?.value),
			...toArray(inputs.d?.value),
		];

		if (this.config.flatten) {
			result = result.flat(Number.POSITIVE_INFINITY);
		}

		if (this.config.unique) {
			result = [...new Set(result.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)))].map(
				(v) => {
					if (typeof v === "string") {
						try {
							return JSON.parse(v);
						} catch {
							return v;
						}
					}
					return v;
				},
			);
		}

		return {
			result: new DataPacket(result),
			length: new DataPacket(result.length),
		};
	}
}
