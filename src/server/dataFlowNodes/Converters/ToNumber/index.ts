import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * ToNumber Converter Node
 * Converts any input to a number.
 */
export default class ToNumberNode extends DataFlowNode {
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
		const useFloat = this.config.parseFloat !== false;
		const useDefault = Boolean(this.config.useDefault);
		const defaultValue = Number(this.config.defaultValue) || 0;

		try {
			let result: number;

			if (typeof value === "number") {
				result = value;
			} else if (typeof value === "boolean") {
				result = value ? 1 : 0;
			} else if (typeof value === "string") {
				const trimmed = value.trim();
				result = useFloat ? parseFloat(trimmed) : parseInt(trimmed, 10);
			} else if (value === null || value === undefined) {
				result = NaN;
			} else if (Array.isArray(value) && value.length === 1) {
				// Single-element array - try to convert the element
				const elem = value[0];
				result = useFloat
					? parseFloat(String(elem))
					: parseInt(String(elem), 10);
			} else {
				result = NaN;
			}

			// Check if conversion succeeded
			if (Number.isNaN(result)) {
				if (useDefault) {
					return {
						result: new DataPacket(defaultValue),
						original: new DataPacket(value),
					};
				}
				return {
					errored: new DataPacket(value),
					original: new DataPacket(value),
				};
			}

			return {
				result: new DataPacket(result),
				original: new DataPacket(value),
			};
		} catch (err) {
			context.logger.error("ToNumber conversion failed", err);
			if (useDefault) {
				return {
					result: new DataPacket(defaultValue),
					original: new DataPacket(value),
				};
			}
			return {
				errored: new DataPacket(value),
				original: new DataPacket(value),
			};
		}
	}
}
