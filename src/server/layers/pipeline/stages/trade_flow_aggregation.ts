import { logger } from "../../../utils/logger";
import type { AggTradeEvent } from "../../sources/binance_aggtrade";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TradeFlowMetrics {
	type: "trade-flow";
	symbol: string;

	// CVD (Cumulative Volume Delta) - buy volume minus sell volume
	cvd1m: number; // Last 1 minute
	cvd2m: number; // Last 2 minutes
	cvd5m: number; // Last 5 minutes

	// Normalized CVD (-1 to 1 range)
	cvdNormalized: number;

	// Volume metrics
	buyVolume1m: number;
	sellVolume1m: number;
	totalVolume1m: number;

	// Buy/Sell ratio (0.5 = neutral, >0.5 = more buys)
	buySellRatio: number;

	// Large orders detection
	largeBuys1m: number; // Count of large buy orders
	largeSells1m: number; // Count of large sell orders
	largeOrderBias: number; // (largeBuys - largeSells) / total

	// Velocity (trades per second)
	tradesPerSecond: number;

	// Latest price
	lastPrice: number;

	timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// Threshold for "large" order in USD
const LARGE_ORDER_THRESHOLD: Record<string, number> = {
	BTCUSDT: 50000, // $50k for BTC
	ETHUSDT: 25000, // $25k for ETH
	SOLUSDT: 10000, // $10k for SOL
	XRPUSDT: 10000, // $10k for XRP
	DEFAULT: 10000,
};

// How often to emit aggregated metrics (ms)
const EMIT_INTERVAL = 1000; // Every second

// Time windows for CVD calculation (ms)
const WINDOWS = {
	"1m": 60 * 1000,
	"2m": 2 * 60 * 1000,
	"5m": 5 * 60 * 1000,
};

// ═══════════════════════════════════════════════════════════════════════════
// TRADE BUFFER
// ═══════════════════════════════════════════════════════════════════════════

interface TradeRecord {
	timestamp: number;
	price: number;
	quoteQty: number;
	side: "BUY" | "SELL";
	isLarge: boolean;
}

interface SymbolBuffer {
	trades: TradeRecord[];
	lastEmit: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE
// ═══════════════════════════════════════════════════════════════════════════

export class TradeFlowAggregationStage extends PipelineStage<
	AggTradeEvent,
	TradeFlowMetrics
> {
	id = "trade-flow-aggregation";
	description = "Aggregates trade tape into CVD and flow metrics";
	inputs = ["binance-aggtrade-source"];
	output = "trade-flow";

	private buffers: Map<string, SymbolBuffer> = new Map();

	public async process(
		data: AggTradeEvent,
		context: ProcessingContext,
	): Promise<TradeFlowMetrics | null> {
		if (context.topic !== "binance-aggtrade-source") return null;
		if (data.type !== "aggtrade") return null;

		const symbol = data.symbol;
		const now = Date.now();

		// Initialize buffer if needed
		if (!this.buffers.has(symbol)) {
			this.buffers.set(symbol, { trades: [], lastEmit: 0 });
		}

		const buffer = this.buffers.get(symbol)!;
		const largeThreshold =
			LARGE_ORDER_THRESHOLD[symbol] ?? LARGE_ORDER_THRESHOLD.DEFAULT!;

		// Add trade to buffer
		buffer.trades.push({
			timestamp: data.tradeTime,
			price: data.price,
			quoteQty: data.quoteQty,
			side: data.side,
			isLarge: data.quoteQty >= largeThreshold,
		});

		// Prune old trades (keep 5 min)
		const cutoff = now - WINDOWS["5m"];
		buffer.trades = buffer.trades.filter((t) => t.timestamp >= cutoff);

		// Emit at interval
		if (now - buffer.lastEmit < EMIT_INTERVAL) {
			return null;
		}

		buffer.lastEmit = now;

		// Calculate metrics
		const metrics = this.calculateMetrics(
			symbol,
			buffer.trades,
			data.price,
			now,
		);

		logger.debug(
			{
				symbol,
				cvd1m: metrics.cvd1m.toFixed(0),
				cvdNorm: metrics.cvdNormalized.toFixed(3),
				ratio: metrics.buySellRatio.toFixed(2),
				largeBuys: metrics.largeBuys1m,
				largeSells: metrics.largeSells1m,
			},
			"Trade flow metrics",
		);

		return metrics;
	}

	private calculateMetrics(
		symbol: string,
		trades: TradeRecord[],
		lastPrice: number,
		now: number,
	): TradeFlowMetrics {
		// Helper to filter by window
		const inWindow = (windowMs: number) =>
			trades.filter((t) => t.timestamp >= now - windowMs);

		const trades1m = inWindow(WINDOWS["1m"]);
		const trades2m = inWindow(WINDOWS["2m"]);
		const trades5m = inWindow(WINDOWS["5m"]);

		// CVD calculation: sum of (buy volume) - (sell volume)
		const calcCVD = (tradeList: TradeRecord[]) =>
			tradeList.reduce(
				(sum, t) => sum + (t.side === "BUY" ? t.quoteQty : -t.quoteQty),
				0,
			);

		const cvd1m = calcCVD(trades1m);
		const cvd2m = calcCVD(trades2m);
		const cvd5m = calcCVD(trades5m);

		// Buy/Sell volumes
		const buyVolume1m = trades1m
			.filter((t) => t.side === "BUY")
			.reduce((sum, t) => sum + t.quoteQty, 0);
		const sellVolume1m = trades1m
			.filter((t) => t.side === "SELL")
			.reduce((sum, t) => sum + t.quoteQty, 0);
		const totalVolume1m = buyVolume1m + sellVolume1m;

		// Buy/Sell ratio
		const buySellRatio = totalVolume1m > 0 ? buyVolume1m / totalVolume1m : 0.5;

		// Large orders
		const largeBuys1m = trades1m.filter(
			(t) => t.isLarge && t.side === "BUY",
		).length;
		const largeSells1m = trades1m.filter(
			(t) => t.isLarge && t.side === "SELL",
		).length;
		const totalLarge = largeBuys1m + largeSells1m;
		const largeOrderBias =
			totalLarge > 0 ? (largeBuys1m - largeSells1m) / totalLarge : 0;

		// Trades per second
		const tradesPerSecond = trades1m.length / 60;

		// Normalize CVD to -1 to 1 range
		// Use total volume as reference (CVD as percentage of total)
		const cvdNormalized =
			totalVolume1m > 0 ? Math.max(-1, Math.min(1, cvd1m / totalVolume1m)) : 0;

		return {
			type: "trade-flow",
			symbol,
			cvd1m,
			cvd2m,
			cvd5m,
			cvdNormalized,
			buyVolume1m,
			sellVolume1m,
			totalVolume1m,
			buySellRatio,
			largeBuys1m,
			largeSells1m,
			largeOrderBias,
			tradesPerSecond,
			lastPrice,
			timestamp: now,
		};
	}
}
