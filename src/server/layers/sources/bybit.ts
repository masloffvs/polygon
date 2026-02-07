import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface BybitConfig extends SourceConfig {
	pairs: string[];
}

export class BybitSource extends BaseSource {
	private ws: WebSocket | null = null;
	// V5 Spot Public
	private readonly baseUrl = "wss://stream.bybit.com/v5/public/spot";
	private pairs: string[];

	constructor(
		config: Omit<BybitConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "bybit-source",
				name: "Bybit Market Data",
				description: "Real-time orderbook streams from Bybit V5 API",
				...config,
			},
			aggregator,
		);
		this.pairs = config.pairs;
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, pairs: this.pairs, url: this.baseUrl },
			"Connecting to Bybit WS...",
		);

		this.ws = new WebSocket(this.baseUrl);

		this.ws.onopen = () => {
			logger.info({ source: this.id }, "Bybit connection established");
			this.subscribe();
		};

		this.ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data as string);
				// Bybit confirmation { "success": true, "ret_msg": "subscribe", "conn_id": "..." }
				if (data.success !== undefined) {
					logger.debug(
						{ source: this.id, msg: data },
						"Received Bybit system message",
					);
					return;
				}
				this.emit(data);
			} catch (err) {
				logger.error({ source: this.id, err }, "Failed to parse Bybit message");
			}
		};

		this.ws.onerror = (event) => {
			logger.error({ source: this.id, event }, "Bybit WebSocket error");
		};

		this.ws.onclose = () => {
			logger.warn(
				{ source: this.id },
				"Bybit connection closed. Reconnecting in 5s...",
			);
			setTimeout(() => this.connect(), 5000);
		};
	}

	private subscribe() {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		// Bybit expects "orderbook.50.BTCUSDT"
		// Assuming input pairs are like "BTCUSDT"
		const args = this.pairs.map((p) => `orderbook.50.${p}`);

		const msg = {
			op: "subscribe",
			args: args,
		};

		logger.info({ source: this.id, msg }, "Sending Bybit subscription");
		this.ws.send(JSON.stringify(msg));
	}

	public disconnect(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}
