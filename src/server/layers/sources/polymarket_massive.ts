import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export class PolymarketMassiveSource extends BaseSource {
	private intervalMs: number;
	private timer: Timer | null = null;
	private readonly endpoint =
		"https://gamma-api.polymarket.com/events?active=true&archived=false&featured=true&cyom=false&include_chat=false&include_template=false&closed=false&liquidity_min=1000&volume_min=1000&limit=10&order=volume24hr&tag_id=2";

	constructor(
		config: Omit<SourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "polymarket-massive-source",
				name: "Polymarket Massive Events",
				description: "Monitors high-volume Polymarket events (Politics/Global)",
				...config,
			},
			aggregator,
		);
		// Default 30 minutes
		this.intervalMs = config.intervalMs || 30 * 60 * 1000;
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, interval: this.intervalMs },
			"Starting Massive Events polling...",
		);

		await this.poll();
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	public disconnect(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async poll() {
		try {
			logger.debug({ source: this.id }, "Fetching massive events...");
			const response = await fetch(this.endpoint, {
				headers: {
					Accept: "application/json",
					"User-Agent": "PolygonBot/1.0",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}

			const data = await response.json();

			if (Array.isArray(data)) {
				this.emit({
					type: "polymarket_massive_batch",
					events: data,
					fetchedAt: Date.now(),
				});

				logger.info(
					{ source: this.id, count: data.length },
					"Polymarket massive events fetched",
				);
			} else {
				logger.warn(
					{ source: this.id },
					"Unexpected response format (not array)",
				);
			}
		} catch (err) {
			logger.error({ source: this.id, err }, "Failed to fetch massive events");
		}
	}
}
