import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ArrayFilterNode extends DataFlowNode {
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
				passed: new DataPacket([]),
				rejected: new DataPacket([]),
				count: new DataPacket(0),
			};
		}

		const mode = this.config.mode || "truthy";
		const filterKey = (this.config.filterKey || "").trim();
		const filterValue = this.config.filterValue ?? "";

		const predicate = (el: unknown): boolean => {
			switch (mode) {
				case "truthy":
					return Boolean(el);

				case "notNull":
					return el !== null && el !== undefined;

				case "contains":
					return String(el).includes(String(filterValue));

				case "keyEquals": {
					if (typeof el !== "object" || el === null) return false;
					const val = _.get(el, filterKey);
					return String(val) === String(filterValue);
				}

				case "keyGt": {
					if (typeof el !== "object" || el === null) return false;
					const val = Number(_.get(el, filterKey));
					return val > Number(filterValue);
				}

				case "keyLt": {
					if (typeof el !== "object" || el === null) return false;
					const val = Number(_.get(el, filterKey));
					return val < Number(filterValue);
				}

				case "typeIs": {
					const filterType = this.config.filterType || "string";
					if (filterType === "array") return Array.isArray(el);
					return typeof el === filterType;
				}

				default:
					return Boolean(el);
			}
		};

		// Special case: unique mode
		if (mode === "unique") {
			const seen = new Set<string>();
			const passed: unknown[] = [];
			const rejected: unknown[] = [];

			for (const el of arrayInput) {
				const key = filterKey
					? String(_.get(el, filterKey))
					: JSON.stringify(el);
				if (seen.has(key)) {
					rejected.push(el);
				} else {
					seen.add(key);
					passed.push(el);
				}
			}

			return {
				passed: new DataPacket(passed),
				rejected: new DataPacket(rejected),
				count: new DataPacket(passed.length),
			};
		}

		const passed = arrayInput.filter(predicate);
		const rejected = arrayInput.filter((el) => !predicate(el));

		return {
			passed: new DataPacket(passed),
			rejected: new DataPacket(rejected),
			count: new DataPacket(passed.length),
		};
	}
}
