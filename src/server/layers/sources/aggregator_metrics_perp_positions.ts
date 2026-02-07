import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface AggregatorMetricsPerpPositionsSourceConfig extends SourceConfig {
	intervalMs?: number;
}

export class AggregatorMetricsPerpPositionsSource extends BaseSource {
	private intervalId: Timer | null = null;
	private intervalMs: number;

	constructor(
		config: Omit<
			AggregatorMetricsPerpPositionsSourceConfig,
			"id" | "name" | "description"
		> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "aggregator-metrics-perp-positions-source",
				name: "Aggregator Metrics Perp Positions",
				description: "Aggregator Metrics Perp Positions Data",
				...config,
			},
			aggregator,
		);
		this.intervalMs = config.intervalMs || 60000;
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting polling...");

		const poll = async () => {
			try {
				const response = await fetch(
					"https://dw3ji7n7thadj.cloudfront.net/aggregator/stats/metrics_perp_positions_charts_data.json",
				);
				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}
				const data = await response.json();
				this.emit(data);
			} catch (err) {
				logger.error({ source: this.id, err }, "Polling failed");
			}
		};

		await poll(); // Initial poll
		this.intervalId = setInterval(poll, this.intervalMs);
	}

	public disconnect(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}
