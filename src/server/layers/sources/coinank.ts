import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface CoinankConfig extends SourceConfig {
	baseCoin: string; // BTC, ETH, XRP, SOL
	apiKey: string;
}

export class CoinankSource extends BaseSource {
	private intervalId: Timer | null = null;
	private readonly baseCoin: string;
	private readonly apiKey: string;

	constructor(
		config: Omit<CoinankConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		const id = `coinank-${config.baseCoin.toLowerCase()}-source`;
		super(
			{
				id,
				name: `Coinank ${config.baseCoin} LS Ratio`,
				description: `Long/Short Ratio for ${config.baseCoin} from Coinank`,
				...config,
			},
			aggregator,
		);
		this.baseCoin = config.baseCoin;
		this.apiKey = config.apiKey;
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting Coinank polling...");

		// Initial fetch
		this.fetchData();

		// Poll every 5 minutes
		this.intervalId = setInterval(
			() => {
				this.fetchData();
			},
			5 * 60 * 1000,
		);
	}

	private async fetchData() {
		try {
			const url = `https://api.coinank.com/api/longshort/realtimeAll?interval=5m&baseCoin=${this.baseCoin}`;
			logger.debug({ source: this.id, url }, "Fetching Coinank data");

			const response = await fetch(url, {
				headers: {
					"coinank-apikey": this.apiKey,
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			this.emit(data);
		} catch (err) {
			logger.error({ source: this.id, err }, "Coinank polling failed");
		}
	}

	public disconnect(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}
