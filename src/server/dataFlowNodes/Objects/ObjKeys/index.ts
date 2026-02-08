import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ObjKeysNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const source = inputs.object?.value;
		if (typeof source !== "object" || source === null) {
			return {
				keys: new DataPacket([]),
				values: new DataPacket([]),
				entries: new DataPacket([]),
				count: new DataPacket(0),
			};
		}

		const depth = this.config.depth || "shallow";

		if (depth === "deep") {
			const flatKeys: string[] = [];
			const flatValues: unknown[] = [];
			const flatEntries: [string, unknown][] = [];

			const walk = (obj: Record<string, unknown>, prefix: string) => {
				for (const [key, val] of Object.entries(obj)) {
					const fullKey = prefix ? `${prefix}.${key}` : key;
					if (
						typeof val === "object" &&
						val !== null &&
						!Array.isArray(val)
					) {
						walk(val as Record<string, unknown>, fullKey);
					} else {
						flatKeys.push(fullKey);
						flatValues.push(val);
						flatEntries.push([fullKey, val]);
					}
				}
			};

			walk(source as Record<string, unknown>, "");

			return {
				keys: new DataPacket(flatKeys),
				values: new DataPacket(flatValues),
				entries: new DataPacket(flatEntries),
				count: new DataPacket(flatKeys.length),
			};
		}

		// shallow
		const keys = Object.keys(source);
		const values = Object.values(source);
		const entries = Object.entries(source);

		return {
			keys: new DataPacket(keys),
			values: new DataPacket(values),
			entries: new DataPacket(entries),
			count: new DataPacket(keys.length),
		};
	}
}
