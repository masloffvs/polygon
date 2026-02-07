// src/server/layers/proxy.ts
import type { DataAdapter } from "../adapters/base";
import { logger } from "../utils/logger";

export class ProxyLayer {
	private adapters = new Map<string, DataAdapter>();

	public register(sourceId: string, adapter: DataAdapter) {
		this.adapters.set(sourceId, adapter);
	}

	public process(sourceId: string, data: unknown): any {
		const adapter = this.adapters.get(sourceId);

		// If no adapter is registered for this source, pass data through raw?
		// Or block? "proxy for declaring types" suggests we enforce it.
		if (!adapter) {
			// Fallback: Just return raw data, but log warn
			// logger.warn({ sourceId }, "No adapter found, passing raw data");
			return data;
		}

		const validated = adapter.validate(data);
		if (!validated) {
			logger.warn(
				{ sourceId, adapter: adapter.name },
				"Validation failed for data packet",
			);
			// Return null or throw? returning null to filter out bad data
			throw new Error("Validation Failed");
		}

		return validated;
	}
}
