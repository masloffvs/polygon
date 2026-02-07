import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface OKXConfig extends SourceConfig {
	pairs: string[];
}

export class OKXSource extends BaseSource {
	private ws: WebSocket | null = null;
	private readonly baseUrl = "wss://ws.okx.com:8443/ws/v5/public";
	private pairs: string[];
	private lastMessageTime: number = 0;
	private watchdogTimer: Timer | null = null;

	constructor(
		config: Omit<OKXConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "okx-source",
				name: "OKX Market Data",
				description: "Real-time orderbook streams from OKX public API",
				...config,
			},
			aggregator,
		);
		this.pairs = config.pairs;
	}

	public async connect(): Promise<void> {
		logger.info(
			{ source: this.id, pairs: this.pairs, url: this.baseUrl },
			"Connecting to OKX WS...",
		);

		this.ws = new WebSocket(this.baseUrl);

		this.ws.onopen = () => {
			logger.info({ source: this.id }, "OKX connection established");
			this.startWatchdog();
			this.subscribe();
		};

		this.ws.onmessage = (event) => {
			this.lastMessageTime = Date.now();
			try {
				const data = JSON.parse(event.data as string);
				// OKX sends "event": "subscribe" confirmation, we should ignore it or log it
				if (data.event) {
					logger.debug(
						{ source: this.id, event: data },
						"Received OKX system event",
					);
					return;
				}
				this.emit(data);
			} catch (err) {
				logger.error({ source: this.id, err }, "Failed to parse OKX message");
			}
		};

		this.ws.onerror = (event) => {
			logger.error({ source: this.id, event }, "OKX WebSocket error");
		};

		this.ws.onclose = () => {
			this.stopWatchdog();
			logger.warn(
				{ source: this.id },
				"OKX connection closed. Reconnecting in 5s...",
			);
			setTimeout(() => this.connect(), 5000);
		};
	}

	public disconnect(): void {
		this.stopWatchdog();
		if (this.ws) {
			if (this.ws.readyState === WebSocket.OPEN) {
				this.ws.close();
			}
			this.ws = null;
		}
	}

	private startWatchdog() {
		this.lastMessageTime = Date.now();
		this.watchdogTimer = setInterval(() => {
			// Send ping every 20s to keep connection alive if idle
			if (
				this.ws &&
				this.ws.readyState === WebSocket.OPEN &&
				Date.now() - this.lastMessageTime > 20000
			) {
				this.ws.send("ping");
			}

			const timeSinceLastMessage = Date.now() - this.lastMessageTime;
			// 60 seconds without data (including pong) = dead connection
			if (timeSinceLastMessage > 60000) {
				logger.error(
					{ source: this.id, timeSinceLastMessage },
					"Watchdog timeout. Terminating connection...",
				);
				this.ws?.close(); // Trigger reconnect
			}
		}, 10000);
	}

	private stopWatchdog() {
		if (this.watchdogTimer) {
			clearInterval(this.watchdogTimer);
			this.watchdogTimer = null;
		}
	}

	private subscribe() {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		// Convert "BTCUSDT" to "BTC-USDT" if necessary.
		// Simple heuristic for USDT pairs which are common in our config.
		const validPairs = this.pairs.map((p) => {
			if (!p.includes("-")) {
				// Try to insert hyphen before USDT
				if (p.endsWith("USDT")) {
					const symbol = p.replace("USDT", "");
					return `${symbol}-USDT`;
				}
				// Fallback for others or return as is
				return p;
			}
			return p;
		});

		const args = validPairs.map((instId) => ({
			channel: "books",
			instId: instId,
		}));

		const msg = {
			op: "subscribe",
			args: args,
		};

		logger.info({ source: this.id, msg }, "Sending OKX subscription");
		this.ws.send(JSON.stringify(msg));
	}

	public disconnect(): void {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}
