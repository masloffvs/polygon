import { serve } from "bun";
import { logger } from "../utils/logger";
import type { AggregatorLayer } from "./aggregator";

export interface TransportConfig {
	id: string;
	port: number;
}

export class TransportLayer {
	constructor(private aggregator: AggregatorLayer) {}

	public start(configs: TransportConfig[]) {
		logger.info("Starting Transport Layer...");

		configs.forEach((config) => {
			const emitter = this.aggregator.getEmitter(config.id);
			if (!emitter) {
				logger.error({ pool: config.id }, "No emitter found for pool");
				return;
			}

			serve({
				port: config.port,
				fetch(req, server) {
					if (server.upgrade(req)) {
						return; // Upgrade successful
					}
					return new Response(undefined, { status: 200 });
				},
				websocket: {
					open: () => {
						logger.info(
							{ pool: config.id, port: config.port },
							"Provider connected",
						);
					},
					message: (_ws, message) => {
						try {
							const payload =
								typeof message === "string" ? this.safeParse(message) : message;
							emitter.emit("data", {
								timestamp: Date.now(),
								data: payload,
							});
						} catch (err) {
							logger.error(
								{ pool: config.id, err },
								"Error processing message",
							);
						}
					},
					close: () => {
						logger.info({ pool: config.id }, "Provider disconnected");
					},
				},
			});

			logger.info({ pool: config.id, port: config.port }, "Listening");
		});
	}

	private safeParse(str: string) {
		try {
			return JSON.parse(str);
		} catch {
			return str;
		}
	}
}
