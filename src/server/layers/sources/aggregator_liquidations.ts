import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface AggregatorLiquidationsConfig extends SourceConfig {
	coins?: string[];
	intervalMs?: number;
}

export class AggregatorLiquidationsSource extends BaseSource {
	private coins: string[];
	private intervalMs: number;
	private timer: Timer | null = null;
	private readonly baseUrl =
		"https://dw3ji7n7thadj.cloudfront.net/aggregator/assets";

	constructor(
		config: Omit<AggregatorLiquidationsConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "aggregator-liquidations-source",
				name: "Aggregator Liquidations",
				description: "Liquidation heatmap for BTC, ETH, SOL, XRP",
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
			"Starting Aggregator Liquidations polling...",
		);
		this.poll();
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	private async poll() {
		for (const coin of this.coins) {
			try {
				const url = `${this.baseUrl}/${coin}/liquidation-heatmap.json`;
				const response = await fetch(url);
				if (!response.ok) {
					logger.warn(
						{ source: this.id, coin, status: response.status },
						"Failed to fetch liquidations",
					);
					continue;
				}
				const data = await response.json();
				this.emit({
					type: "liquidation_heatmap",
					coin,
					data,
					timestamp: Date.now(),
				});
			} catch (err) {
				logger.error(
					{ source: this.id, coin, err },
					"Error fetching liquidations",
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
