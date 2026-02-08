import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArraySortNode extends DataFlowNode {
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
			return { result: new DataPacket([]) };
		}

		const direction = this.config.direction || "asc";
		const sortKey = (this.config.sortKey || "").trim();
		const compareType = this.config.type || "auto";

		const getValue = (item: unknown): unknown => {
			if (sortKey && typeof item === "object" && item !== null) {
				return _.get(item, sortKey);
			}
			return item;
		};

		const toComparable = (v: unknown): number | string => {
			if (compareType === "number") return Number(v) || 0;
			if (compareType === "string") return String(v);
			if (compareType === "date") return new Date(String(v)).getTime() || 0;
			// auto
			if (typeof v === "number") return v;
			if (typeof v === "string") {
				const num = Number(v);
				return Number.isNaN(num) ? v : num;
			}
			return String(v);
		};

		const sorted = [...arrayInput].sort((a, b) => {
			const va = toComparable(getValue(a));
			const vb = toComparable(getValue(b));

			let cmp: number;
			if (typeof va === "number" && typeof vb === "number") {
				cmp = va - vb;
			} else {
				cmp = String(va).localeCompare(String(vb));
			}

			return direction === "desc" ? -cmp : cmp;
		});

		return { result: new DataPacket(sorted) };
	}
}
