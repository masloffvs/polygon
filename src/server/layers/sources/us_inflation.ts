import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface UsInflationConfig extends SourceConfig {
	/** Polling interval in milliseconds, default 6 hours */
	intervalMs?: number;
	/** API Key for api.massive.com */
	apiKey?: string;
}

export class UsInflationSource extends BaseSource {
	private intervalMs: number;
	private apiKey: string;
	private timer: Timer | null = null;

	private readonly baseUrl = "https://api.massive.com/fed/v1/inflation";

	constructor(
		config: Omit<UsInflationConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "us-inflation-source",
				name: "US Inflation Data",
				description: "US CPI and PCE data from Massiv Data",
				...config,
			},
			aggregator,
		);
		// Default 6 hours: 6 * 60 * 60 * 1000 = 21600000
		this.intervalMs = config.intervalMs ?? 21600000;
		this.apiKey =
			config.apiKey ||
			process.env.MASSIVE_API_KEY ||
			"kpmOWeeil_oQOejuLlUShP4aR0y5blLu"; // Fallback to provided key if environment variable is missing
	}

	public async connect(): Promise<void> {
		logger.info(
			{
				source: this.id,
				interval: this.intervalMs,
			},
			"Starting US Inflation polling...",
		);

		// Initial fetch
		await this.poll();

		// Start polling
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	private async poll(): Promise<void> {
		const url = `${this.baseUrl}?limit=10&sort=date.desc&apiKey=${this.apiKey}`;

		try {
			logger.debug({ source: this.id }, "Fetching US Inflation data...");

			const response = await fetch(url, {
				headers: {
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			const data = await response.json();

			if (data.status === "OK" && Array.isArray(data.results)) {
				this.emit({
					type: "us_inflation_batch",
					dataList: data.results,
					fetchedAt: Date.now(),
				});

				logger.info(
					{ source: this.id, count: data.results.length },
					"US Inflation data fetched successfully",
				);
			} else {
				logger.warn(
					{ source: this.id, data },
					"US Inflation API returned unexpected format",
				);
			}
		} catch (err) {
			logger.error(
				{ source: this.id, err },
				"Failed to fetch US Inflation data",
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
