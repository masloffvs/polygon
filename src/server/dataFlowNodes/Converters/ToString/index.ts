import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * ToString Converter Node
 * Converts any input to a string representation.
 */
export default class ToStringNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		inputs: Record<string, DataPacket>,
		context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const input = inputs.data;
		if (input === undefined) return {};

		const value = input.value;
		const prettyPrint = Boolean(this.config.prettyPrint);

		try {
			let result: string;

			if (value === null) {
				result = "null";
			} else if (value === undefined) {
				result = "undefined";
			} else if (typeof value === "string") {
				result = value;
			} else if (typeof value === "number" || typeof value === "boolean") {
				result = String(value);
			} else if (typeof value === "object") {
				result = prettyPrint
					? JSON.stringify(value, null, 2)
					: JSON.stringify(value);
			} else {
				result = String(value);
			}

			return {
				result: new DataPacket(result),
				original: new DataPacket(value),
			};
		} catch (err) {
			context.logger.error("ToString conversion failed", err);
			return {
				errored: new DataPacket(value),
				original: new DataPacket(value),
			};
		}
	}
}
