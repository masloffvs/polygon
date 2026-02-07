import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export interface Liquidation {
	exchange: string;
	symbol: string;
	side: "LONG" | "SHORT";
	size: number;
	price: number;
	value: number;
	timestamp: Date;
}

interface LiquidationsSourceConfig extends SourceConfig {
	symbols?: string[];
}

const DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL", "XRP"];

export class LiquidationsSource extends BaseSource {
	private connections: WebSocket[] = [];
	private symbolFilter: string[];
	private isConnected = false;
	private reconnectTimers: ReturnType<typeof setTimeout>[] = [];

	constructor(
		config: Omit<LiquidationsSourceConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "liquidations-source",
				name: "Liquidations Aggregator",
				description:
					"Aggregated realtime liquidations from Binance, Bybit, OKX, Deribit, BitMEX",
				...config,
			},
			aggregator,
		);
		this.symbolFilter = config.symbols || DEFAULT_SYMBOLS;
	}

	public async connect(): Promise<void> {
		if (this.isConnected) return;
		logger.info({ source: this.id }, "Connecting to liquidation feeds...");
		this.isConnected = true;

		// Connect to all exchanges
		this.connectBinanceFutures();
		this.connectBinanceCoinM();
		this.connectBybitLinear();
		this.connectBybitInverse();
		this.connectOKX();
		this.connectDeribit();
		this.connectBitMEX();
	}

	public disconnect(): void {
		logger.info({ source: this.id }, "Disconnecting...");
		this.isConnected = false;
		this.connections.forEach((ws) => ws.close());
		this.connections = [];
		this.reconnectTimers.forEach((t) => clearTimeout(t));
		this.reconnectTimers = [];
	}

	private matchesFilter(symbol: string): boolean {
		const upper = symbol.toUpperCase();
		return this.symbolFilter.some((s) => upper.includes(s));
	}

	private emitLiquidation(liq: Liquidation) {
		if (!this.matchesFilter(liq.symbol)) return;

		// Emit normalized liquidation event
		this.emit({
			type: "liquidation",
			...liq,
			timestamp: liq.timestamp.getTime(),
		});
	}

	// --- CONNECTORS ---

	private connectBinanceFutures() {
		if (!this.isConnected) return;
		const ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
		this.connections.push(ws);

		ws.onopen = () =>
			logger.info({ source: this.id }, "Binance Futures connected");

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				const data = msg.o;
				if (!data) return;

				const liq: Liquidation = {
					exchange: "Binance",
					symbol: data.s,
					side: data.S === "BUY" ? "SHORT" : "LONG", // If they buy, it was a short liq
					size: parseFloat(data.q),
					price: parseFloat(data.ap),
					value: parseFloat(data.q) * parseFloat(data.ap),
					timestamp: new Date(data.T),
				};
				this.emitLiquidation(liq);
			} catch (_err) {}
		};

		ws.onclose = () =>
			this.scheduleReconnect(this.connectBinanceFutures.bind(this));
		ws.onerror = () => {};
	}

	private connectBinanceCoinM() {
		if (!this.isConnected) return;
		const ws = new WebSocket("wss://dstream.binance.com/ws/!forceOrder@arr");
		this.connections.push(ws);

		ws.onopen = () =>
			logger.info({ source: this.id }, "Binance CoinM connected");

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				const data = msg.o;
				if (!data) return;

				const liq: Liquidation = {
					exchange: "Binance",
					symbol: data.s,
					side: data.S === "BUY" ? "SHORT" : "LONG",
					size: parseFloat(data.q),
					price: parseFloat(data.ap),
					value: parseFloat(data.q) * 10, // ROUGH ESTIMATE
					timestamp: new Date(data.T),
				};
				this.emitLiquidation(liq);
			} catch (_err) {}
		};

		ws.onclose = () =>
			this.scheduleReconnect(this.connectBinanceCoinM.bind(this));
		ws.onerror = () => {};
	}

	private connectBybitLinear() {
		if (!this.isConnected) return;
		const ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");
		this.connections.push(ws);

		ws.onopen = () => {
			logger.info({ source: this.id }, "Bybit Linear connected");
			ws.send(
				JSON.stringify({
					op: "subscribe",
					args: [
						"liquidation.BTCUSDT",
						"liquidation.ETHUSDT",
						"liquidation.SOLUSDT",
						"liquidation.XRPUSDT",
					],
				}),
			);
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				if (msg.topic?.startsWith("liquidation") && msg.data) {
					const data = msg.data;

					const item = data;
					const liq: Liquidation = {
						exchange: "Bybit",
						symbol: item.symbol,
						side: item.side === "Buy" ? "SHORT" : "LONG",
						size: parseFloat(item.size),
						price: parseFloat(item.price),
						value: parseFloat(item.size) * parseFloat(item.price),
						timestamp: new Date(parseInt(msg.ts, 10)),
					};
					this.emitLiquidation(liq);
				}
			} catch (_err) {}
		};

		ws.onclose = () =>
			this.scheduleReconnect(this.connectBybitLinear.bind(this));
		ws.onerror = () => {};
	}

	private connectBybitInverse() {
		if (!this.isConnected) return;
		const ws = new WebSocket("wss://stream.bybit.com/v5/public/inverse");
		this.connections.push(ws);

		ws.onopen = () => {
			logger.info({ source: this.id }, "Bybit Inverse connected");
			ws.send(
				JSON.stringify({
					op: "subscribe",
					args: [
						"liquidation.BTCUSD",
						"liquidation.ETHUSD",
						"liquidation.SOLUSD",
						"liquidation.XRPUSD",
					],
				}),
			);
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				if (msg.topic?.startsWith("liquidation") && msg.data) {
					const item = msg.data;
					const liq: Liquidation = {
						exchange: "Bybit",
						symbol: item.symbol,
						side: item.side === "Buy" ? "SHORT" : "LONG",
						size: parseFloat(item.size),
						price: parseFloat(item.price),
						value: parseFloat(item.size) * parseFloat(item.price),
						timestamp: new Date(parseInt(msg.ts, 10)),
					};
					this.emitLiquidation(liq);
				}
			} catch (_err) {}
		};

		ws.onclose = () =>
			this.scheduleReconnect(this.connectBybitInverse.bind(this));
		ws.onerror = () => {};
	}

	private connectOKX() {
		if (!this.isConnected) return;
		const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
		this.connections.push(ws);

		ws.onopen = () => {
			logger.info({ source: this.id }, "OKX connected");
			const instruments = [
				"BTC-USDT-SWAP",
				"ETH-USDT-SWAP",
				"SOL-USDT-SWAP",
				"XRP-USDT-SWAP",
				"BTC-USD-SWAP",
				"ETH-USD-SWAP",
			];
			const args = instruments.map((id) => ({
				channel: "liquidation-orders",
				instId: id,
			}));
			ws.send(JSON.stringify({ op: "subscribe", args }));
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				if (msg.arg?.channel === "liquidation-orders" && msg.data) {
					msg.data.forEach((d: any) => {
						const liq: Liquidation = {
							exchange: "OKX",
							symbol: d.instId,
							side: d.posSide === "short" ? "SHORT" : "LONG",
							size: parseFloat(d.sz),
							price: parseFloat(d.bkPx || d.avgPx),
							value: parseFloat(d.sz) * parseFloat(d.bkPx || d.avgPx || "0"),
							timestamp: new Date(parseInt(d.ts, 10)),
						};
						this.emitLiquidation(liq);
					});
				}
			} catch (_err) {}
		};

		ws.onclose = () => this.scheduleReconnect(this.connectOKX.bind(this));
		ws.onerror = () => {};
	}

	private connectDeribit() {
		if (!this.isConnected) return;
		const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
		this.connections.push(ws);

		ws.onopen = () => {
			logger.info({ source: this.id }, "Deribit connected");
			ws.send(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "public/subscribe",
					params: {
						channels: ["trades.BTC-PERPETUAL.raw", "trades.ETH-PERPETUAL.raw"],
					},
				}),
			);
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				if (msg.params?.channel.startsWith("trades") && msg.params.data) {
					msg.params.data.forEach((t: any) => {
						if (t.liquidation) {
							const liq: Liquidation = {
								exchange: "Deribit",
								symbol: t.instrument_name,
								side: t.direction === "buy" ? "SHORT" : "LONG",
								size: t.amount,
								price: t.price,
								value: t.amount * t.price,
								timestamp: new Date(t.timestamp),
							};
							this.emitLiquidation(liq);
						}
					});
				}
			} catch (_err) {}
		};

		ws.onclose = () => this.scheduleReconnect(this.connectDeribit.bind(this));
		ws.onerror = () => {};
	}

	private connectBitMEX() {
		if (!this.isConnected) return;
		const ws = new WebSocket("wss://www.bitmex.com/realtime");
		this.connections.push(ws);

		ws.onopen = () => {
			logger.info({ source: this.id }, "BitMEX connected");
			ws.send(JSON.stringify({ op: "subscribe", args: ["liquidation"] }));
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data as string);
				if (
					msg.table === "liquidation" &&
					msg.action === "insert" &&
					msg.data
				) {
					msg.data.forEach((d: any) => {
						const liq: Liquidation = {
							exchange: "BitMEX",
							symbol: d.symbol,
							side: d.side === "Buy" ? "SHORT" : "LONG",
							size: d.orderQty,
							price: d.price,
							value: d.orderQty,
							timestamp: new Date(),
						};
						this.emitLiquidation(liq);
					});
				}
			} catch (_err) {}
		};

		ws.onclose = () => this.scheduleReconnect(this.connectBitMEX.bind(this));
		ws.onerror = () => {};
	}

	private scheduleReconnect(connectFn: () => void) {
		if (!this.isConnected) return;
		const timer = setTimeout(() => {
			connectFn();
		}, 5000);
		this.reconnectTimers.push(timer);
	}
}
