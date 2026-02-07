import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface CbsNbaConfig extends SourceConfig {
	accessToken: string;
}

export class CbsNbaSource extends BaseSource {
	private ws: WebSocket | null = null;
	private readonly baseUrl =
		"wss://torq.cbssports.com/torq/handler/1/1/websocket";
	private accessToken: string;
	private checkInterval: Timer | null = null;

	constructor(
		config: Omit<CbsNbaConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "cbs-nba-source",
				name: "CBS NBA Scoreboard",
				description: "Real-time NBA scoreboard from CBS Sports",
				...config,
			},
			aggregator,
		);
		this.accessToken = config.accessToken;
	}

	public async connect(): Promise<void> {
		if (!this.accessToken) {
			logger.warn(
				{ source: this.id },
				"No access token provided for CBS NBA Source. Skipping connection.",
			);
			return;
		}

		logger.info({ source: this.id }, "Connecting to CBS Sports WebSocket...");

		this.ws = new WebSocket(this.baseUrl);

		this.ws.onopen = () => {
			logger.info(
				{ source: this.id },
				"CBS connection established. Logging in...",
			);
			this.login();
		};

		this.ws.onmessage = (event) => {
			try {
				const rawMsg = event.data as string;

				// Handle heartbeats or other frames if necessary
				// SockJS 'h' frame is heartbeat
				if (rawMsg.startsWith("h")) {
					return;
				}

				// We only care about 'a' frames (array of messages)
				if (!rawMsg.startsWith("a[")) {
					// Might be 'o' (open) or 'c' (close) or 'c[...]'. Check valid json?
					// User says response starts with 'a'.
					return;
				}

				// Remove 'a' prefix
				const jsonStr = rawMsg.slice(1);
				const batch = JSON.parse(jsonStr);

				if (Array.isArray(batch)) {
					for (const msgString of batch) {
						this.handleMessage(msgString);
					}
				}
			} catch (err) {
				logger.error(
					{ source: this.id, err, raw: event.data },
					"Failed to parse CBS message",
				);
			}
		};

		this.ws.onerror = (event) => {
			logger.error({ source: this.id, event }, "CBS WebSocket error");
		};

		this.ws.onclose = () => {
			logger.warn(
				{ source: this.id },
				"CBS connection closed. Reconnecting in 5s...",
			);
			this.stopHeartbeat();
			setTimeout(() => this.connect(), 5000);
		};
	}

	private handleMessage(msgString: string) {
		try {
			const msg = JSON.parse(msgString);

			// Check for login response
			if (msg.authorized === "ok") {
				logger.info({ source: this.id }, "Login successful. Subscribing...");
				this.subscribe();
				return;
			}

			// Check for subscription response
			if (msg.cmd === "subscribe" && msg.result === "ok") {
				logger.info(
					{ source: this.id, topic: msg.topic },
					"Subscription successful",
				);
				return;
			}

			// Data message
			// User says: { "expires": "...", "topic": "/nba/scoreboard", "body": { ... } }
			if (msg.topic === "/nba/scoreboard" && msg.body) {
				this.emit(msg.body);
			}
		} catch (err) {
			logger.error(
				{ source: this.id, err, msgString },
				"Failed to parse inner message",
			);
		}
	}

	private login() {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		const payload = JSON.stringify({
			cmd: "login",
			access_token: this.accessToken,
		});

		// Format: ["payload_string"]
		this.ws.send(JSON.stringify([payload]));
	}

	private subscribe() {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

		const payload = JSON.stringify({
			cmd: "subscribe",
			topics: ["/nba/scoreboard"],
		});

		// Format: ["payload_string"]
		this.ws.send(JSON.stringify([payload]));
	}

	private stopHeartbeat() {
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}
	}

	public disconnect(): void {
		this.stopHeartbeat();
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}
