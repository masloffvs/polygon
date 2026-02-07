import { BinanceLongShortSchema } from "../../adapters/binance_ls";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface BinanceLongShortSourceConfig extends SourceConfig {
	symbol: string; // e.g., "SOLUSDT"
	periodMinutes?: number;
	intervalMs?: number;
}

export class BinanceLongShortSource extends BaseSource {
	private symbol: string;
	private periodMinutes: number;
	private intervalMs: number;
	private timer: Timer | null = null;

	constructor(
		config: Omit<BinanceLongShortSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: `binance-ls-${config.symbol.toLowerCase()}-source`,
				name: `Binance LS: ${config.symbol}`,
				description: `Long/Short Ratio for ${config.symbol}`,
				...config,
			},
			aggregator,
		);
		this.symbol = config.symbol;
		this.periodMinutes = config.periodMinutes || 1;
		this.intervalMs = config.intervalMs || 60000;
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, symbol: this.symbol },
			"Starting Binance LS Monitor...",
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
			const response = await fetch(
				"https://www.binance.com/bapi/futures/v1/public/future/data/global-long-short-account-ratio",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: this.symbol,
						periodMinutes: this.periodMinutes,
					}),
				},
			);

			if (!response.ok) {
				throw new Error(`HTTP Error: ${response.status}`);
			}

			const data = await response.json();
			const parsed = BinanceLongShortSchema.safeParse(data);

			if (parsed.success) {
				// Extract the latest data point
				const latestIndex = parsed.data.data.xAxis.length - 1;
				if (latestIndex >= 0) {
					// Map the series nicely
					const series = parsed.data.data.series;
					const lsRatioObj = series.find((s) => s.name === "Long/Short Ratio");
					const longAccObj = series.find((s) => s.name === "Long Account");
					const shortAccObj = series.find((s) => s.name === "Short Account");

					const timestamp = parsed.data.data.xAxis[latestIndex];
					const ratio = lsRatioObj?.data[latestIndex];
					const longPct = longAccObj?.data[latestIndex];
					const shortPct = shortAccObj?.data[latestIndex];

					// Normalize
					const payload = {
						symbol: this.symbol,
						timestamp,
						ratio: Number(ratio),
						longAccount:
							typeof longPct === "string"
								? parseFloat(longPct)
								: Number(longPct),
						shortAccount:
							typeof shortPct === "string"
								? parseFloat(shortPct)
								: Number(shortPct),
					};

					this.emit(payload);
				}
			} else {
				logger.warn(
					{ source: this.id, err: parsed.error },
					"Schema validation failed",
				);
			}
		} catch (err) {
			logger.error({ source: this.id, err }, "Polling failed");
		}
	}
}
