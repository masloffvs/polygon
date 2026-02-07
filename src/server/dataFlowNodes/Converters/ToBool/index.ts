import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

const STRICT_TRUE_VALUES = ["true", "1", "yes", "on"];
const STRICT_FALSE_VALUES = ["false", "0", "no", "off"];

/**
 * ToBool Converter Node
 * Converts any input to boolean with configurable rules.
 */
export default class ToBoolNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	public async process(
		inputs: Record<string, DataPacket>,
		_context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const input = inputs.data;
		if (input === undefined) return {};

		const value = input.value;
		const strictMode = Boolean(this.config.strictMode);
		const emptyArrayIsFalse = this.config.emptyArrayIsFalse !== false;
		const zeroIsFalse = this.config.zeroIsFalse !== false;

		try {
			// Handle null/undefined
			if (value === null || value === undefined) {
				if (strictMode) {
					return {
						errored: new DataPacket(value),
						original: new DataPacket(value),
					};
				}
				return {
					result: new DataPacket(false),
					original: new DataPacket(value),
				};
			}

			// Already boolean
			if (typeof value === "boolean") {
				return {
					result: new DataPacket(value),
					original: new DataPacket(value),
				};
			}

			// Number
			if (typeof value === "number") {
				if (Number.isNaN(value)) {
					if (strictMode) {
						return {
							errored: new DataPacket(value),
							original: new DataPacket(value),
						};
					}
					return {
						result: new DataPacket(false),
						original: new DataPacket(value),
					};
				}

				if (zeroIsFalse) {
					return {
						result: new DataPacket(value !== 0),
						original: new DataPacket(value),
					};
				} else {
					if (strictMode && value !== 0 && value !== 1) {
						return {
							errored: new DataPacket(value),
							original: new DataPacket(value),
						};
					}
					return {
						result: new DataPacket(Boolean(value)),
						original: new DataPacket(value),
					};
				}
			}

			// String
			if (typeof value === "string") {
				const lower = value.toLowerCase().trim();

				if (STRICT_TRUE_VALUES.includes(lower)) {
					return {
						result: new DataPacket(true),
						original: new DataPacket(value),
					};
				}

				if (STRICT_FALSE_VALUES.includes(lower)) {
					return {
						result: new DataPacket(false),
						original: new DataPacket(value),
					};
				}

				if (strictMode) {
					return {
						errored: new DataPacket(value),
						original: new DataPacket(value),
					};
				}

				return {
					result: new DataPacket(value.length > 0),
					original: new DataPacket(value),
				};
			}

			// Array
			if (Array.isArray(value)) {
				if (strictMode) {
					return {
						errored: new DataPacket(value),
						original: new DataPacket(value),
					};
				}

				if (emptyArrayIsFalse) {
					return {
						result: new DataPacket(value.length > 0),
						original: new DataPacket(value),
					};
				} else {
					return {
						result: new DataPacket(true),
						original: new DataPacket(value),
					};
				}
			}

			// Object
			if (typeof value === "object") {
				if (strictMode) {
					return {
						errored: new DataPacket(value),
						original: new DataPacket(value),
					};
				}
				return {
					result: new DataPacket(true),
					original: new DataPacket(value),
				};
			}

			// Fallback
			if (strictMode) {
				return {
					errored: new DataPacket(value),
					original: new DataPacket(value),
				};
			}

			return {
				result: new DataPacket(Boolean(value)),
				original: new DataPacket(value),
			};
		} catch (_err) {
			return {
				errored: new DataPacket(value),
				original: new DataPacket(value),
			};
		}
	}
}
