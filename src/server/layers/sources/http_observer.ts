import crypto from "node:crypto"; // Use built-in crypto for hashing
import type { ZodSchema } from "zod";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface HttpObserverConfig extends SourceConfig {
	url: string | (() => string); // Support dynamic URL
	intervalMs?: number; // Polling interval, default 5000ms
	schema: ZodSchema<any>;
}

export class HttpObserverSource extends BaseSource {
	private url: string | (() => string);
	private intervalMs: number;
	private timer: Timer | null = null;
	private lastHash: string | null = null;
	private schema: ZodSchema<any>;

	constructor(
		config: Omit<HttpObserverConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		const descriptionUrl =
			typeof config.url === "string" ? config.url : "Dynamic URL";
		super(
			{
				id: config.id || "http-observer",
				name: config.name || "HTTP Observer",
				description: config.description || `Observes ${descriptionUrl}`,
				...config,
			},
			aggregator,
		);
		this.url = config.url;
		this.intervalMs = config.intervalMs || 10000;
		this.schema = config.schema;
	}

	public async connect(): Promise<void> {
		const initialUrl = typeof this.url === "function" ? this.url() : this.url;
		logger.info(
			{ source: this.id, url: initialUrl, interval: this.intervalMs },
			"Starting HTTP Observer...",
		);

		// Initial fetch
		await this.poll();

		// Start polling
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	private async poll() {
		try {
			const currentUrl = typeof this.url === "function" ? this.url() : this.url;
			const response = await fetch(currentUrl);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			const rawData = await response.json();

			// Validate against schema
			const parsed = this.schema.safeParse(rawData);

			if (!parsed.success) {
				logger.warn(
					{ source: this.id, errors: parsed.error },
					"Schema validation failed",
				);
				return;
			}

			const data = parsed.data;

			// Check for changes (Simple stringify hash for deep object)
			const currentString = JSON.stringify(data);
			const currentHash = crypto
				.createHash("sha256")
				.update(currentString)
				.digest("hex");

			if (this.lastHash !== currentHash) {
				logger.info({ source: this.id }, "Detected change in HTTP source");
				this.lastHash = currentHash;
				this.emit(data);
			}
		} catch (err) {
			logger.error({ source: this.id, err }, "Polling failed");
		}
	}

	public disconnect(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
