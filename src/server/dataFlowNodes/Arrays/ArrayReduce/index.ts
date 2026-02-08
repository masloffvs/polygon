import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayReduceNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const arrayInput = inputs.array?.value;
		if (!Array.isArray(arrayInput) || arrayInput.length === 0) {
			return { result: new DataPacket(null) };
		}

		const operation = this.config.operation || "sum";
		const valueKey = (this.config.valueKey || "").trim();
		const separator = this.config.separator ?? ", ";

		const extract = (el: unknown): unknown => {
			if (valueKey && typeof el === "object" && el !== null) {
				return _.get(el, valueKey);
			}
			return el;
		};

		const nums = (): number[] =>
			arrayInput.map((el) => Number(extract(el))).filter((n) => !Number.isNaN(n));

		let result: unknown;

		switch (operation) {
			case "sum": {
				const n = nums();
				result = n.reduce((a, b) => a + b, 0);
				break;
			}
			case "avg": {
				const n = nums();
				result = n.length > 0 ? n.reduce((a, b) => a + b, 0) / n.length : 0;
				break;
			}
			case "min": {
				const n = nums();
				result = n.length > 0 ? Math.min(...n) : null;
				break;
			}
			case "max": {
				const n = nums();
				result = n.length > 0 ? Math.max(...n) : null;
				break;
			}
			case "count":
				result = arrayInput.length;
				break;
			case "join":
				result = arrayInput.map((el) => String(extract(el))).join(separator);
				break;
			case "first":
				result = arrayInput[0];
				break;
			case "last":
				result = arrayInput[arrayInput.length - 1];
				break;
			case "flatten":
				result = arrayInput.flat(Number.POSITIVE_INFINITY);
				break;
			default:
				result = null;
		}

		return { result: new DataPacket(result) };
	}
}
