import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { ProxyLayer } from "../proxy";

export interface SourceConfig {
	id: string;
	name: string;
	description: string;
}

export abstract class BaseSource {
	protected proxy?: ProxyLayer;

	constructor(
		protected config: SourceConfig,
		protected aggregator: AggregatorLayer,
	) {}

	// We allow injecting the proxy later or in constructor
	public setProxy(proxy: ProxyLayer) {
		this.proxy = proxy;
	}

	public get id() {
		return this.config.id;
	}

	public get info() {
		return this.config;
	}

	abstract connect(): Promise<void>;
	abstract disconnect(): void;

	protected emit(rawData: any) {
		let finalData = rawData;

		// IF Proxy is set, validate/transform through it
		if (this.proxy) {
			try {
				finalData = this.proxy.process(this.config.id, rawData);
			} catch (e) {
				// If validation fails, we stop processing this packet
				logger.error(
					{ source: this.config.id, err: e },
					"Validation/Proxy error - dropping data",
				);
				return;
			}
		}

		const emitter = this.aggregator.getEmitter(this.config.id);
		if (emitter) {
			emitter.emit("data", {
				source: this.config.id,
				timestamp: Date.now(),
				data: finalData,
			});
		} else {
			logger.error({ source: this.config.id }, "No emitter found for source");
		}
	}
}
