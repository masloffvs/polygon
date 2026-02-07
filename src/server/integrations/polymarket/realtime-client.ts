// src/server/integrations/polymarket/realtime-client.ts

import { logger } from "../../utils/logger";
import type { UserInfo } from "./types";

export interface RealtimeActivity {
	asset: string;
	bio: string;
	conditionId: string;
	eventSlug: string;
	icon: string;
	name: string;
	outcome: string;
	outcomeIndex: number;
	price: number;
	profileImage: string;
	proxyWallet: string;
	pseudonym: string;
	side: "BUY" | "SELL";
	size: number;
	slug: string;
	timestamp: number;
	title: string;
	transactionHash: string;
}

export interface RealtimeMessage {
	connection_id: string;
	payload: RealtimeActivity;
	timestamp: number;
	topic: string;
	type: string;
}

export interface WhaleTrade extends RealtimeActivity {
	usdcValue: number;
	userInfo: UserInfo;
}

export type RealtimeEventType =
	| "trade"
	| "whale"
	| "connected"
	| "disconnected"
	| "error";

export interface RealtimeEvent {
	type: RealtimeEventType;
	trade?: RealtimeActivity;
	whaleTrade?: WhaleTrade;
	error?: Error;
	timestamp: Date;
}

type TradeCallback = (trade: RealtimeActivity) => void;
type WhaleCallback = (trade: WhaleTrade) => void;
type ConnectionCallback = () => void;
type ErrorCallback = (error: Error) => void;
type AnyCallback = (event: RealtimeEvent) => void | Promise<void>;

export interface RealtimeClientConfig {
	/** WebSocket URL */
	url?: string;
	/** Minimum trade size to be considered a whale trade (in shares) */
	whaleThreshold?: number;
	/** Minimum USDC value to be considered a whale trade */
	whaleUsdcThreshold?: number;
	/** Logic for whale thresholds: "or" = either threshold, "and" = both thresholds */
	whaleLogic?: "or" | "and";
	/** Filter by trade side (BUY or SELL). If not set, both are included */
	sideFilter?: "BUY" | "SELL";
	/** Auto reconnect on disconnect */
	autoReconnect?: boolean;
	/** Reconnect delay in ms */
	reconnectDelay?: number;
	/** Filter by specific wallet addresses (lowercase) */
	watchedAddresses?: Set<string>;
	/** User info map for watched addresses */
	userInfoMap?: Map<string, UserInfo>;
}

const DEFAULT_URL = "wss://ws-live-data.polymarket.com/";

export class PolymarketRealtimeClient {
	private config: RealtimeClientConfig;
	private ws: WebSocket | null = null;
	private isRunning = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private lastMessageTime = 0;
	private readonly HEARTBEAT_INTERVAL = 30000; // Check every 30s
	private readonly HEARTBEAT_TIMEOUT = 60000; // Consider dead if no message for 60s

	private tradeHandlers: TradeCallback[] = [];
	private whaleHandlers: WhaleCallback[] = [];
	private connectedHandlers: ConnectionCallback[] = [];
	private disconnectedHandlers: ConnectionCallback[] = [];
	private errorHandlers: ErrorCallback[] = [];
	private anyHandlers: AnyCallback[] = [];

	constructor(config: RealtimeClientConfig = {}) {
		this.config = {
			url: DEFAULT_URL,
			whaleThreshold: 1000,
			whaleUsdcThreshold: 500,
			whaleLogic: "or",
			autoReconnect: true,
			reconnectDelay: 5000,
			watchedAddresses: new Set(),
			userInfoMap: new Map(),
			...config,
		};
	}

	/**
	 * Subscribe to all trades
	 */
	onTrade(callback: TradeCallback): this {
		this.tradeHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to whale trades (large trades)
	 */
	onWhale(callback: WhaleCallback): this {
		this.whaleHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to connection events
	 */
	onConnected(callback: ConnectionCallback): this {
		this.connectedHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to disconnection events
	 */
	onDisconnected(callback: ConnectionCallback): this {
		this.disconnectedHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to error events
	 */
	onError(callback: ErrorCallback): this {
		this.errorHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to all events
	 */
	onAny(callback: AnyCallback): this {
		this.anyHandlers.push(callback);
		return this;
	}

	/**
	 * Add a wallet address to watch
	 */
	watchAddress(address: string, userInfo?: Partial<UserInfo>): this {
		const addr = address.toLowerCase();
		this.config.watchedAddresses?.add(addr);
		if (userInfo) {
			this.config.userInfoMap?.set(addr, {
				address: addr,
				name: userInfo.name,
				// description: userInfo.description,
			});
		}
		return this;
	}

	/**
	 * Set whale threshold (minimum shares)
	 */
	whaleThreshold(size: number): this {
		this.config.whaleThreshold = size;
		return this;
	}

	/**
	 * Set whale USDC threshold (minimum value)
	 */
	whaleUsdcThreshold(value: number): this {
		this.config.whaleUsdcThreshold = value;
		return this;
	}

	/**
	 * Set whale comparison logic
	 * @param logic "or" = either threshold triggers whale, "and" = both thresholds required
	 */
	whaleComparisonLogic(logic: "or" | "and"): this {
		this.config.whaleLogic = logic;
		return this;
	}

	/**
	 * Start the realtime connection
	 */
	start(): this {
		if (this.isRunning) {
			logger.warn("Realtime client is already running");
			return this;
		}

		this.isRunning = true;
		this.connect();
		return this;
	}

	/**
	 * Stop the realtime connection
	 */
	stop(): this {
		this.isRunning = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		return this;
	}

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.lastMessageTime = Date.now();

		this.heartbeatTimer = setInterval(() => {
			const now = Date.now();
			const timeSinceLastMessage = now - this.lastMessageTime;

			if (timeSinceLastMessage > this.HEARTBEAT_TIMEOUT) {
				logger.warn(
					{ timeSinceLastMessage },
					"⚠️ Polymarket WS appears stale, forcing reconnect...",
				);
				this.forceReconnect();
			}
		}, this.HEARTBEAT_INTERVAL);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private forceReconnect(): void {
		this.stopHeartbeat();
		if (this.ws) {
			try {
				this.ws.close();
			} catch (_e) {
				// Ignore close errors
			}
			this.ws = null;
		}
		if (this.isRunning) {
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}
		logger.info(
			{ delay: this.config.reconnectDelay },
			"🔄 Scheduling reconnect...",
		);
		this.reconnectTimer = setTimeout(() => {
			this.connect();
		}, this.config.reconnectDelay);
	}

	private connect(): void {
		try {
			// Clean up any existing connection
			if (this.ws) {
				try {
					this.ws.close();
				} catch (_e) {
					// Ignore
				}
				this.ws = null;
			}

			logger.info("🔄 Attempting to connect to Polymarket realtime feed...");
			this.ws = new WebSocket(this.config.url!);

			this.ws.onopen = () => {
				logger.info("🔌 Connected to Polymarket realtime feed");

				// Start heartbeat monitoring
				this.startHeartbeat();

				// Subscribe to activity
				this.ws?.send(
					JSON.stringify({
						action: "subscribe",
						subscriptions: [
							{
								topic: "activity",
								type: "orders_matched",
								filters: "",
							},
						],
					}),
				);

				this.connectedHandlers.forEach((h) => h());
				this.emitAny({ type: "connected", timestamp: new Date() });
			};

			this.ws.onmessage = (event) => {
				// Update last message time for heartbeat
				this.lastMessageTime = Date.now();

				try {
					// Skip empty or invalid messages
					if (
						!event.data ||
						typeof event.data !== "string" ||
						event.data.trim() === ""
					) {
						return;
					}

					const data = JSON.parse(event.data) as RealtimeMessage;

					if (data.type === "orders_matched" && data.payload) {
						this.handleTrade(data.payload);
					}
				} catch (_err) {
					// Silently ignore parse errors for ping/pong or incomplete messages
					// console.error("Failed to parse message:", err);
				}
			};

			this.ws.onclose = (event) => {
				logger.info(
					{ code: event.code, reason: event.reason },
					"🔌 Disconnected from Polymarket realtime feed",
				);
				this.stopHeartbeat();
				this.disconnectedHandlers.forEach((h) => h());
				this.emitAny({ type: "disconnected", timestamp: new Date() });

				if (this.isRunning && this.config.autoReconnect) {
					this.scheduleReconnect();
				}
			};

			this.ws.onerror = (_event) => {
				logger.error("❌ Polymarket WebSocket error occurred");
				const error = new Error("WebSocket error");
				this.errorHandlers.forEach((h) => h(error));
				this.emitAny({ type: "error", error, timestamp: new Date() });
				// Force reconnect on error - the onclose might not fire in some cases
				this.forceReconnect();
			};
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			logger.error({ err: error }, "❌ Failed to create WebSocket connection");
			this.errorHandlers.forEach((h) => h(error));
			this.emitAny({ type: "error", error, timestamp: new Date() });

			// Schedule reconnect on connection failure
			if (this.isRunning && this.config.autoReconnect) {
				this.scheduleReconnect();
			}
		}
	}

	private handleTrade(trade: RealtimeActivity): void {
		const walletAddress = trade.proxyWallet.toLowerCase();
		const usdcValue = trade.size * trade.price;

		// Check side filter
		if (this.config.sideFilter && trade.side !== this.config.sideFilter) {
			return; // Skip trades that don't match side filter
		}

		// Check if this is a watched address
		const isWatched =
			this.config.watchedAddresses?.size === 0 ||
			this.config.watchedAddresses?.has(walletAddress);

		if (!isWatched) {
			return; // Skip trades from non-watched addresses
		}

		// Emit trade event
		this.tradeHandlers.forEach((h) => h(trade));
		this.emitAny({ type: "trade", trade, timestamp: new Date() });

		// Check if whale trade
		const meetsShareThreshold = trade.size >= this.config.whaleThreshold!;
		const meetsValueThreshold = usdcValue >= this.config.whaleUsdcThreshold!;
		const isWhale =
			this.config.whaleLogic === "and"
				? meetsShareThreshold && meetsValueThreshold
				: meetsShareThreshold || meetsValueThreshold;

		if (isWhale) {
			const userInfo = this.config.userInfoMap?.get(walletAddress) ?? {
				address: walletAddress,
				name: trade.name || trade.pseudonym,
			};

			const whaleTrade: WhaleTrade = {
				...trade,
				usdcValue,
				userInfo,
			};

			this.whaleHandlers.forEach((h) => h(whaleTrade));
			this.emitAny({ type: "whale", whaleTrade, timestamp: new Date() });
		}
	}

	private emitAny(event: RealtimeEvent): void {
		this.anyHandlers.forEach((h) => {
			try {
				h(event);
			} catch (err) {
				logger.error({ err }, "Error in onAny handler");
			}
		});
	}
}

/**
 * Builder for RealtimeClient
 */
export class RealtimeClientBuilder {
	private config: RealtimeClientConfig = {
		watchedAddresses: new Set(),
		userInfoMap: new Map(),
	};

	/**
	 * Set custom WebSocket URL
	 */
	url(url: string): this {
		this.config.url = url;
		return this;
	}

	/**
	 * Set minimum trade size to be considered whale (shares)
	 */
	whaleThreshold(size: number): this {
		this.config.whaleThreshold = size;
		return this;
	}

	/**
	 * Set minimum USDC value to be considered whale
	 */
	whaleUsdcThreshold(value: number): this {
		this.config.whaleUsdcThreshold = value;
		return this;
	}

	/**
	 * Set whale comparison logic
	 * @param logic "or" = either threshold triggers whale, "and" = both thresholds required
	 */
	whaleComparisonLogic(logic: "or" | "and"): this {
		this.config.whaleLogic = logic;
		return this;
	}

	/**
	 * Enable/disable auto reconnect
	 */
	autoReconnect(enabled: boolean): this {
		this.config.autoReconnect = enabled;
		return this;
	}

	/**
	 * Set reconnect delay in ms
	 */
	reconnectDelay(ms: number): this {
		this.config.reconnectDelay = ms;
		return this;
	}

	/**
	 * Watch a specific address
	 */
	watch(address: string, name?: string, _description?: string): this {
		const addr = address.toLowerCase();
		this.config.watchedAddresses?.add(addr);
		this.config.userInfoMap?.set(addr, {
			address: addr,
			name,
			// description,
		});
		return this;
	}

	/**
	 * Watch all trades (no address filter)
	 */
	watchAll(): this {
		this.config.watchedAddresses = new Set();
		return this;
	}

	/**
	 * Only show BUY trades
	 */
	onlyBuys(): this {
		this.config.sideFilter = "BUY";
		return this;
	}

	/**
	 * Only show SELL trades
	 */
	onlySells(): this {
		this.config.sideFilter = "SELL";
		return this;
	}

	/**
	 * Show both BUY and SELL trades (default)
	 */
	bothSides(): this {
		this.config.sideFilter = undefined;
		return this;
	}

	/**
	 * Build the realtime client
	 */
	build(): PolymarketRealtimeClient {
		return new PolymarketRealtimeClient(this.config);
	}
}

/**
 * Create a realtime client builder
 *
 * @example
 * ```ts
 * const realtime = createRealtimeClient()
 *   .whaleThreshold(500)           // 500+ shares = whale
 *   .whaleUsdcThreshold(1000)      // $1000+ = whale
 *   .watch("0x123...", "Whale #1") // watch specific address
 *   .watchAll()                    // or watch everyone
 *   .build();
 *
 * realtime
 *   .onTrade((trade) => console.log('Trade:', trade))
 *   .onWhale((whale) => console.log('🐋 WHALE:', whale))
 *   .onConnected(() => console.log('Connected!'))
 *   .start();
 * ```
 */
export function createRealtimeClient(): RealtimeClientBuilder {
	return new RealtimeClientBuilder();
}
