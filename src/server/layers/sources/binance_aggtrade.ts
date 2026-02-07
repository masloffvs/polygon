import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface BinanceAggTradeConfig extends SourceConfig {
	pairs: string[];
}

// Raw aggTrade message from Binance
export interface BinanceAggTradeRaw {
	e: "aggTrade"; // Event type
	E: number; // Event time
	s: string; // Symbol
	a: number; // Aggregate trade ID
	p: string; // Price
	q: string; // Quantity
	f: number; // First trade ID
	l: number; // Last trade ID
	T: number; // Trade time
	m: boolean; // Is the buyer the market maker? (true = SELL, false = BUY)
	M: boolean; // Ignore
}

// Parsed trade event
export interface AggTradeEvent {
	type: "aggtrade";
	symbol: string;
	price: number;
	quantity: number;
	quoteQty: number; // price * quantity (USD value)
	side: "BUY" | "SELL";
	tradeTime: number;
	timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE
// ═══════════════════════════════════════════════════════════════════════════

export class BinanceAggTradeSource extends BaseSource {
	private ws: WebSocket | null = null;
	private readonly baseUrl = "wss://fstream.binance.com/stream"; // Futures for better volume
	private pairs: string[];
	private lastMessageTime: number = 0;
	private watchdogTimer: Timer | null = null;

	constructor(
		config: Omit<BinanceAggTradeConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "binance-aggtrade-source",
				name: "Binance Aggregated Trades",
				description: "Real-time trade tape from Binance Futures",
				...config,
			},
			aggregator,
		);
		this.pairs = config.pairs;
	}

	public async connect(): Promise<void> {
		// Format: stream?streams=<symbol>@aggTrade/<symbol>@aggTrade
		const streams = this.pairs.map((p) => `${p.toLowerCase()}@aggTrade`);
		const combinedUrl = `${this.baseUrl}?streams=${streams.join("/")}`;

		logger.info(
			{ source: this.id, pairs: this.pairs, url: combinedUrl },
			"Connecting to Binance aggTrade WS...",
		);

		this.ws = new WebSocket(combinedUrl);

		this.ws.onopen = () => {
			logger.info(
				{ source: this.id },
				"Binance aggTrade connection established",
			);
			this.startWatchdog();
		};

		this.ws.onmessage = (event) => {
			this.lastMessageTime = Date.now();
			try {
				const wrapper = JSON.parse(event.data as string);
				const raw = wrapper.data as BinanceAggTradeRaw;

				if (raw.e !== "aggTrade") return;

				const price = parseFloat(raw.p);
				const quantity = parseFloat(raw.q);

				const parsed: AggTradeEvent = {
					type: "aggtrade",
					symbol: raw.s,
					price,
					quantity,
					quoteQty: price * quantity,
					side: raw.m ? "SELL" : "BUY", // m=true means buyer is maker = market SELL
					tradeTime: raw.T,
					timestamp: Date.now(),
				};

				this.emit(parsed);
			} catch (err) {
				logger.error(
					{ source: this.id, err },
					"Failed to parse aggTrade message",
				);
			}
		};

		this.ws.onerror = (event) => {
			logger.error({ source: this.id, event }, "aggTrade WebSocket error");
		};

		this.ws.onclose = () => {
			this.stopWatchdog();
			logger.warn(
				{ source: this.id },
				"aggTrade connection closed. Reconnecting in 5s...",
			);
			setTimeout(() => this.connect(), 5000);
		};
	}

	private startWatchdog(): void {
		this.watchdogTimer = setInterval(() => {
			const now = Date.now();
			if (this.lastMessageTime > 0 && now - this.lastMessageTime > 30000) {
				logger.warn(
					{ source: this.id },
					"No messages for 30s, reconnecting...",
				);
				this.ws?.close();
			}
		}, 10000);
	}

	private stopWatchdog(): void {
		if (this.watchdogTimer) {
			clearInterval(this.watchdogTimer);
			this.watchdogTimer = null;
		}
	}

	public disconnect(): void {
		this.stopWatchdog();
		if (this.ws) {
			this.ws.close();
			this.ws = null;
			logger.info({ source: this.id }, "Disconnected from Binance aggTrade");
		}
	}
}
