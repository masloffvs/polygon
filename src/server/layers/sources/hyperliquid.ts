import WebSocket from "ws";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface HyperliquidConfig extends SourceConfig {
	endpoint?: string;
}

export class HyperliquidSource extends BaseSource {
	private ws: WebSocket | null = null;
	private endpoint: string;
	private reconnectTimer: Timer | null = null;

	constructor(
		config: Omit<HyperliquidConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "hyperliquid-source",
				name: "Hyperliquid Mids",
				description: "Hyperliquid allMids WebSocket Feed",
				...config,
			},
			aggregator,
		);
		this.endpoint = config.endpoint || "wss://api.hyperliquid.xyz/ws";
	}

	public async connect(): Promise<void> {
		if (this.ws) return;

		logger.info({ source: this.id }, "Connecting to Hyperliquid...");

		this.ws = new WebSocket(this.endpoint);

		this.ws.on("open", () => {
			logger.info({ source: this.id }, "Connected. Subscribing...");
			if (this.ws) {
				this.ws.send(
					JSON.stringify({
						method: "subscribe",
						subscription: { type: "allMids" },
					}),
				);
			}
		});

		this.ws.on("message", (data: WebSocket.Data) => {
			try {
				const parsed = JSON.parse(data.toString());
				// Expected format: {"channel":"allMids","data":{"mids":{...}}}
				if (parsed.channel === "allMids" && parsed.data?.mids) {
					this.emit({
						type: "hyperliquid_mids",
						mids: parsed.data.mids,
						timestamp: Date.now(),
					});
				}
			} catch (err) {
				logger.error({ source: this.id, err }, "Failed to parse message");
			}
		});

		this.ws.on("error", (err) => {
			logger.error({ source: this.id, err }, "WebSocket error");
		});

		this.ws.on("close", () => {
			logger.warn(
				{ source: this.id },
				"Connection closed. Reconnecting in 5s...",
			);
			this.ws = null;
			this.reconnectTimer = setTimeout(() => this.connect(), 5000);
		});
	}

	public disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}
