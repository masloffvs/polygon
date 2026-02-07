import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import { BaseSource, type SourceConfig } from "./base";

interface PolymarketGammaSourceConfig extends SourceConfig {
	intervalMs?: number;
	endpoint?: string;
}

interface GammaEvent {
	eventType: "new" | "update";
	market: any;
	timestamp: number;
}

export class PolymarketGammaSource extends BaseSource {
	private intervalId: Timer | null = null;
	private intervalMs: number;
	private endpoint: string;
	// Map of ID -> updatedAt string
	private knownMarkets = new Map<string, string>();

	constructor(
		config: Omit<PolymarketGammaSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "polymarket-gamma-source",
				name: "Polymarket Gamma",
				description: "Polls Polymarket Gamma API for high volume markets",
				...config,
			},
			aggregator,
		);
		this.intervalMs = config.intervalMs || 60000;
		this.endpoint =
			config.endpoint ||
			"https://gamma-api.polymarket.com/markets?volume_num_min=1000000&order=volume24hrClob&liquidity_num_min=999&closed=false&ascending=false";
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, intervalMs: this.intervalMs },
			"Starting polling...",
		);

		// Initial fetch immediately
		await this.fetchData();

		this.intervalId = setInterval(async () => {
			await this.fetchData();
		}, this.intervalMs);
	}

	public disconnect(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.knownMarkets.clear();
	}

	private async fetchData() {
		try {
			logger.debug(
				{ source: this.id, url: this.endpoint },
				"Fetching markets...",
			);
			const response = await fetch(this.endpoint);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const data = await response.json();

			if (!Array.isArray(data)) {
				logger.warn({ source: this.id }, "Response is not an array");
				return;
			}

			let newCount = 0;
			let updateCount = 0;

			for (const market of data) {
				if (!market.id) continue;

				const isKnown = this.knownMarkets.has(market.id);
				const lastUpdated = this.knownMarkets.get(market.id);
				const currentUpdated = market.updatedAt;

				if (!isKnown) {
					// New Event
					this.knownMarkets.set(market.id, currentUpdated);
					this.emit({
						eventType: "new",
						market,
						timestamp: Date.now(),
					} as GammaEvent);
					newCount++;
				} else if (lastUpdated !== currentUpdated) {
					// Update Event
					this.knownMarkets.set(market.id, currentUpdated);
					this.emit({
						eventType: "update",
						market,
						timestamp: Date.now(),
					} as GammaEvent);
					updateCount++;
				}
			}

			logger.info(
				{
					source: this.id,
					total: data.length,
					new: newCount,
					updates: updateCount,
				},
				"Poll complete",
			);
		} catch (err) {
			logger.error({ source: this.id, err }, "Polling failed");
		}
	}
}
