import _ from "lodash-es";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export default class ObjSetNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const source = inputs.object?.value;
		const value = inputs.value?.value;
		const path = (this.config.path || "").trim();

		if (!path) {
			return { object: new DataPacket(source ?? {}) };
		}

		// Deep clone to avoid mutation
		const obj =
			typeof source === "object" && source !== null
				? JSON.parse(JSON.stringify(source))
				: {};

		const createPath = this.config.createPath !== "false";

		if (createPath) {
			_.set(obj, path, value);
		} else {
			// Only set if intermediate path exists
			const parts = path.split(".");
			if (parts.length === 1) {
				obj[path] = value;
			} else {
				const parentPath = parts.slice(0, -1).join(".");
				const parent = _.get(obj, parentPath);
				if (typeof parent === "object" && parent !== null) {
					const lastKey = parts[parts.length - 1];
					parent[lastKey] = value;
				}
			}
		}

		return { object: new DataPacket(obj) };
	}
}
