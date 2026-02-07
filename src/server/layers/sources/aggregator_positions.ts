import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface AggregatorPositionsConfig extends SourceConfig {
	coins?: string[];
	intervalMs?: number;
}

export class AggregatorPositionsSource extends BaseSource {
	private coins: string[];
	private intervalMs: number;
	private timer: Timer | null = null;
	private readonly baseUrl =
		"https://dw3ji7n7thadj.cloudfront.net/aggregator/assets";

	constructor(
		config: Omit<AggregatorPositionsConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "aggregator-positions-source",
				name: "Aggregator Positions",
				description: "Position metrics for BTC, ETH, SOL, XRP",
				...config,
			},
			aggregator,
		);
		this.coins = config.coins || ["BTC", "ETH", "SOL", "XRP"];
		this.intervalMs = config.intervalMs || 60000; // 1 minute default
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, coins: this.coins },
			"Starting Aggregator Positions polling...",
		);
		this.poll();
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	private async poll() {
		for (const coin of this.coins) {
			try {
				const url = `${this.baseUrl}/${coin}/position-metrics_v2.json`;
				const response = await fetch(url);
				if (!response.ok) {
					logger.warn(
						{ source: this.id, coin, status: response.status },
						"Failed to fetch positions",
					);
					continue;
				}
				const data = await response.json();
				this.emit({
					type: "position_metrics",
					coin,
					data,
					timestamp: Date.now(),
				});
			} catch (err) {
				logger.error(
					{ source: this.id, coin, err },
					"Error fetching positions",
				);
			}
		}
	}

	public disconnect(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
