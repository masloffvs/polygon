import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface BinanceConfig extends SourceConfig {
	pairs: string[];
}

export class BinanceSource extends BaseSource {
	private ws: WebSocket | null = null;
	private readonly baseUrl = "wss://stream.binance.com:9443/stream";
	private pairs: string[];
	private lastMessageTime: number = 0;
	private watchdogTimer: Timer | null = null;

	constructor(
		config: Omit<BinanceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "binance-source",
				name: "Binance Market Data",
				description: "Real-time orderbook streams from Binance Spot API",
				...config,
			},
			aggregator,
		);
		this.pairs = config.pairs;
	}

	public async connect(): Promise<void> {
		// Construct stream URL
		// Format: stream?streams=<streamName1>/<streamName2>
		const streams = this.pairs.map((p) => `${p.toLowerCase()}@depth20@100ms`);
		const combinedUrl = `${this.baseUrl}?streams=${streams.join("/")}`;

		logger.info(
			{ source: this.id, pairs: this.pairs, url: combinedUrl },
			"Connecting to Binance WS...",
		);

		this.ws = new WebSocket(combinedUrl);

		this.ws.onopen = () => {
			logger.info({ source: this.id }, "Binance connection established");
			this.startWatchdog();
		};

		this.ws.onmessage = (event) => {
			this.lastMessageTime = Date.now();
			try {
				const data = JSON.parse(event.data as string);
				this.emit(data);
			} catch (err) {
				logger.error(
					{ source: this.id, err },
					"Failed to parse Binance message",
				);
			}
		};

		this.ws.onerror = (event) => {
			logger.error({ source: this.id, event }, "Binance WebSocket error");
		};

		this.ws.onclose = () => {
			this.stopWatchdog();
			logger.warn(
				{ source: this.id },
				"Binance connection closed. Reconnecting in 5s...",
			);
			setTimeout(() => this.connect(), 5000);
		};
	}

	public disconnect(): void {
		this.stopWatchdog();
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	private startWatchdog() {
		this.lastMessageTime = Date.now();
		this.watchdogTimer = setInterval(() => {
			const timeSinceLastMessage = Date.now() - this.lastMessageTime;
			// 60 seconds without data = dead connection
			if (timeSinceLastMessage > 60000) {
				logger.error(
					{ source: this.id, timeSinceLastMessage },
					"Watchdog timeout. Terminating connection...",
				);
				this.ws?.close(); // This will trigger onclose -> reconnect
			}
		}, 10000); // Check every 10s
	}

	private stopWatchdog() {
		if (this.watchdogTimer) {
			clearInterval(this.watchdogTimer);
			this.watchdogTimer = null;
		}
	}
}
