import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface AggregatorPerpVolumeSourceConfig extends SourceConfig {
	intervalMs?: number;
}

export class AggregatorPerpVolumeSource extends BaseSource {
	private intervalId: Timer | null = null;
	private intervalMs: number;

	constructor(
		config: Omit<
			AggregatorPerpVolumeSourceConfig,
			"id" | "name" | "description"
		> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "aggregator-perp-volume-source",
				name: "Aggregator Perp Volume",
				description: "Aggregator Perp Volume Data",
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
					"https://dw3ji7n7thadj.cloudfront.net/aggregator/stats/perp_volume.json",
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
