import { logger } from "../../utils/logger";
import { pfetch } from "../../utils/puppeteer_network";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export class TradersUnionSource extends BaseSource {
	private intervalId: Timer | null = null;
	// Symbol 149 is Bitcoin
	private readonly endpoint =
		"https://quotes.tradersunion.com/api/v3/informer/technical-analysis/detailed/?symbol=149";

	constructor(
		config: Omit<SourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "traders-union-source",
				name: "Traders Union Technical Analysis",
				description:
					"Technical analysis indicators from Traders Union for Bitcoin",
				...config,
			},
			aggregator,
		);
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting polling...");
		await this.fetchData(); // Fetch immediately on start

		// Poll every 15 minutes
		this.intervalId = setInterval(
			() => {
				this.fetchData();
			},
			15 * 60 * 1000,
		);
	}

	private async fetchData() {
		try {
			const response = await pfetch(this.endpoint, {
				method: "GET",
				headers: {
					Accept: "application/json, text/plain, */*",
				},
			});

			if (!response.ok) {
				logger.error(
					{ source: this.id, status: response.status },
					"Fetch failed with status",
				);
				return;
			}

			const data = await response.json();
			this.emit(data);
		} catch (err) {
			logger.error({ source: this.id, err }, "Polling failed");
		}
	}

	public disconnect(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}
