import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface FearGreedConfig extends SourceConfig {
	/** Polling interval in milliseconds, default 1 hour */
	intervalMs?: number;
	/** How many days of history to fetch, default 30 */
	historyDays?: number;
}

export class FearGreedSource extends BaseSource {
	private intervalMs: number;
	private historyDays: number;
	private timer: Timer | null = null;

	private readonly baseUrl =
		"https://api.coinmarketcap.com/data-api/v3/fear-greed/chart";

	constructor(
		config: Omit<FearGreedConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "fear-greed-source",
				name: "Fear & Greed Index",
				description: "CoinMarketCap Fear & Greed Index historical data",
				...config,
			},
			aggregator,
		);
		this.intervalMs = config.intervalMs ?? 60 * 60 * 1000; // 1 hour default
		this.historyDays = config.historyDays ?? 30;
	}

	private buildUrl(): string {
		const now = Math.floor(Date.now() / 1000);
		const start = now - this.historyDays * 24 * 60 * 60;
		return `${this.baseUrl}?start=${start}&end=${now}`;
	}

	public async connect(): Promise<void> {
		logger.info(
			{
				source: this.id,
				interval: this.intervalMs,
				historyDays: this.historyDays,
			},
			"Starting Fear & Greed Index polling...",
		);

		// Initial fetch
		await this.poll();

		// Start polling
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	private async poll(): Promise<void> {
		const url = this.buildUrl();

		try {
			logger.debug({ source: this.id, url }, "Fetching Fear & Greed data...");

			const response = await fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; PolygonBot/1.0)",
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			const data = await response.json();

			// Emit with type marker
			this.emit({
				type: "fear_greed_batch",
				dataList: data?.data?.dataList ?? [],
				fetchedAt: Date.now(),
			});

			logger.info(
				{ source: this.id, count: data?.data?.dataList?.length ?? 0 },
				"Fear & Greed data fetched successfully",
			);
		} catch (err) {
			logger.error(
				{ source: this.id, err },
				"Failed to fetch Fear & Greed data",
			);
		}
	}

	public disconnect(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		logger.info({ source: this.id }, "Fear & Greed source disconnected");
	}
}
