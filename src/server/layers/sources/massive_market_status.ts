import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface MassiveMarketStatusConfig extends SourceConfig {
	/** Polling interval in milliseconds, default 30 minutes */
	intervalMs?: number;
	/** API Key for api.massive.com */
	apiKey?: string;
}

export class MassiveMarketStatusSource extends BaseSource {
	private intervalMs: number;
	private apiKey: string;
	private timer: Timer | null = null;

	private readonly baseUrl = "https://api.massive.com/v1/marketstatus/now";

	constructor(
		config: Omit<MassiveMarketStatusConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "massive-market-status-source",
				name: "Massive Market Status",
				description: "Global Market Status (Crypto, FX, Stocks)",
				...config,
			},
			aggregator,
		);
		// Default 30 minutes: 30 * 60 * 1000 = 1800000
		this.intervalMs = config.intervalMs ?? 1800000;
		this.apiKey =
			config.apiKey ||
			process.env.MASSIVE_API_KEY ||
			"kpmOWeeil_oQOejuLlUShP4aR0y5blLu";
	}

	public async connect(): Promise<void> {
		logger.info(
			{
				source: this.id,
				interval: this.intervalMs,
			},
			"Starting Massive Market Status polling...",
		);

		// Initial fetch
		await this.poll();

		// Start polling
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	private async poll(): Promise<void> {
		const url = `${this.baseUrl}?apiKey=${this.apiKey}`;

		try {
			logger.debug({ source: this.id }, "Fetching Massive Market Status...");

			const response = await fetch(url, {
				headers: {
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			const data = await response.json();

			this.emit({
				type: "massive_market_status",
				data: data,
				fetchedAt: Date.now(),
			});

			logger.info(
				{ source: this.id, market: data.market },
				"Massive Market Status fetched successfully",
			);
		} catch (err) {
			logger.error(
				{ source: this.id, err },
				"Failed to fetch Massive Market Status",
			);
		}
	}

	public disconnect(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
