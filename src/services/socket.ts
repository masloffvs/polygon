import { EventEmitter } from "node:events";

// Determine WebSocket URL based on environment
const getDefaultWsUrl = (): string => {
	if (typeof window !== "undefined") {
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const host = window.location.host;
		const isLocalhost =
			host.includes("localhost") || host.includes("127.0.0.1");

		if (isLocalhost) {
			return "ws://localhost:3001/ws";
		}

		return `${protocol}//${host}/ws`;
	}
	return "ws://localhost:3001/ws";
};

class SocketService extends EventEmitter {
	private ws: WebSocket | null = null;
	private url: string = getDefaultWsUrl();
	private reconnectInterval: number = 2000;
	private shouldReconnect: boolean = true;

	public status: "connected" | "disconnected" | "connecting" = "disconnected";
	public latency: number | null = null;

	public connect(url?: string) {
		if (url) this.url = url;

		if (this.ws) {
			this.ws.close();
		}

		this.status = "connecting";
		this.emit("status", this.status);

		this.ws = new WebSocket(this.url);

		this.ws.onopen = () => {
			this.status = "connected";
			this.emit("status", this.status);
			console.log("Global WebSocket Connected");
			this.startPing();
		};

		this.ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.type === "pong") {
					this.latency = Date.now() - data.ts;
					this.emit("latency", this.latency);
					return;
				}

				// Emit generic event for subscribers
				this.emit("message", data);

				// Allow subscribing to specific pools/topics if structure matches { pool: 'name', event: ... }
				if (data.pool) {
					this.emit(data.pool, data.event);
				}
			} catch (err) {
				console.error("Socket message parse error", err);
			}
		};

		this.ws.onclose = () => {
			this.status = "disconnected";
			this.latency = null;
			this.emit("status", this.status);
			this.emit("latency", null);

			if (this.shouldReconnect) {
				setTimeout(() => this.connect(), this.reconnectInterval);
			}
		};

		this.ws.onerror = (err) => {
			console.error("WebSocket error", err);
		};
	}

	public disconnect() {
		this.shouldReconnect = false;
		if (this.ws) {
			this.ws.close();
		}
	}

	public send(data: any) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(data));
		}
	}

	private startPing() {
		const interval = setInterval(() => {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				this.ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
			} else {
				clearInterval(interval);
			}
		}, 2000);
	}
}

export const socketService = new SocketService();
