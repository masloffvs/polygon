import type { TradersUnionEvent } from "../../../adapters/traders_union";
import type { TradingViewTechEvent } from "../../../adapters/tradingview_tech";
import { logger } from "../../../utils/logger";
import type { PhasedTickEvent } from "../../sources/interval_ticker";
import type { Liquidation } from "../../sources/liquidations";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { AggregatedLongShort } from "./binance_ls_aggregation";
import type { ProfitabilitySnapshot } from "./crypto_profitability";
import type { NormalizedOrderBook } from "./normalize";
import type { TradeFlowMetrics } from "./trade_flow_aggregation";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Signal with Metadata (Layer 0.5)
// ═══════════════════════════════════════════════════════════════════════════

export interface SignalWithMetadata {
	value: number;
	timestamp: number;
	source: string;
}

export interface SignalFreshnessConfig {
	maxAge: number; // Seconds after which signal is stale
	halfLife: number; // Seconds for freshness to decay to 0.5
	requireFresh: boolean;
}

const FRESHNESS_CONFIG: Record<string, SignalFreshnessConfig> = {
	"binance-ls": { maxAge: 120, halfLife: 60, requireFresh: false },
	orderbook: { maxAge: 5, halfLife: 2, requireFresh: true },
	tradingview: { maxAge: 900, halfLife: 450, requireFresh: false },
	"traders-union": { maxAge: 900, halfLife: 450, requireFresh: false },
	"trade-flow": { maxAge: 5, halfLife: 2, requireFresh: true }, // CVD is super fresh
	"whale-leaders": { maxAge: 30, halfLife: 15, requireFresh: true }, // Top traders from Polymarket
	liquidations: { maxAge: 60, halfLife: 30, requireFresh: false }, // Liquidation cascade signal
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Network Weights (Layer 2 & 3)
// ═══════════════════════════════════════════════════════════════════════════

export interface SourceWeights {
	[sourceId: string]: {
		[symbol: string]: number;
	};
}

export interface NetworkWeights {
	source: SourceWeights;
	threshold: { up: number; down: number };
}

// Default weights (Layer 2)
const DEFAULT_WEIGHTS: NetworkWeights = {
	source: {
		"binance-ls": {
			BTCUSDT: 0.2,
			ETHUSDT: 0.25,
			SOLUSDT: 0.15,
			XRPUSDT: 0.1,
		},
		orderbook: { BTCUSDT: 0.15, ETHUSDT: 0.15, SOLUSDT: 0.15, XRPUSDT: 0.15 },
		tradingview: { BTCUSDT: 0.2, ETHUSDT: 0.2, SOLUSDT: 0.2, XRPUSDT: 0.15 },
		"traders-union": {
			BTCUSDT: 0.15,
			ETHUSDT: 0.15,
			SOLUSDT: 0.2,
			XRPUSDT: 0.3,
		},
		// Trade flow is king for short-term predictions!
		"trade-flow": {
			BTCUSDT: 0.3,
			ETHUSDT: 0.25,
			SOLUSDT: 0.3,
			XRPUSDT: 0.3,
		},
		// Whale leaders from Polymarket - high priority for phases 1-2!
		"whale-leaders": {
			BTCUSDT: 0.35,
			ETHUSDT: 0.35,
			SOLUSDT: 0.35,
			XRPUSDT: 0.35,
		},
		// Liquidations - cascade effect signal (LONG liquidations = bearish, SHORT = bullish)
		liquidations: {
			BTCUSDT: 0.25,
			ETHUSDT: 0.25,
			SOLUSDT: 0.3,
			XRPUSDT: 0.3,
		},
	},
	threshold: { up: 0.12, down: -0.12 },
};

// ═══════════════════════════════════════════════════════════════════════════
// PHASED PREDICTION CONFIG
// ═══════════════════════════════════════════════════════════════════════════

// Confidence thresholds per phase (adaptive - lower early, higher late)
// Early prediction with moderate confidence = valuable signal
// Late prediction needs higher confidence (less time for price movement)
const PHASE_CONFIDENCE_THRESHOLDS: Record<1 | 2 | 3, number> = {
	1: 15, // Phase 1: 15%+ early = get in early, time to confirm later
	2: 55, // Phase 2: 55%+ middle ground
	3: 75, // Phase 3: 75%+ last chance, need higher confidence
};

// Weight multipliers based on historical winrate (can be updated dynamically)
// These adjust how much we trust each source per phase
interface PhaseWeightMultiplier {
	phase: 1 | 2 | 3;
	multipliers: {
		"binance-ls": number;
		orderbook: number;
		tradingview: number;
		"traders-union": number;
		"trade-flow": number;
		"whale-leaders": number;
		liquidations: number;
	};
}

// Default phase weight multipliers (can be tuned based on winrate)
const PHASE_WEIGHT_MULTIPLIERS: PhaseWeightMultiplier[] = [
	{
		phase: 1,
		multipliers: {
			"binance-ls": 1.2, // L/S ratio more predictive early
			orderbook: 0.8, // OB less stable early
			tradingview: 1.0,
			"traders-union": 1.0,
			"trade-flow": 1.3, // CVD is king for scalping!
			"whale-leaders": 1.5, // TOP PRIORITY in phase 1!
			liquidations: 1.4, // Liquidation cascades are very predictive early!
		},
	},
	{
		phase: 2,
		multipliers: {
			"binance-ls": 1.0,
			orderbook: 1.1, // OB builds up
			tradingview: 1.1,
			"traders-union": 1.0,
			"trade-flow": 1.2,
			"whale-leaders": 1.4, // Still high priority in phase 2
			liquidations: 1.2, // Still valuable mid-phase
		},
	},
	{
		phase: 3,
		multipliers: {
			"binance-ls": 0.9,
			orderbook: 1.3, // OB most reliable late
			tradingview: 1.0,
			"traders-union": 0.9,
			"trade-flow": 1.1, // Still valuable
			"whale-leaders": 1.0, // Normal weight in phase 3
			liquidations: 1.0, // Less impact late
		},
	},
];

// ═══════════════════════════════════════════════════════════════════════════
// TYPES: Candidate & Prediction
// ═══════════════════════════════════════════════════════════════════════════

export interface SmartMoneyCandidateV2 {
	symbol: string;
	signals: {
		lsRatio: SignalWithMetadata | null;
		orderBook: SignalWithMetadata | null;
		tvTech: SignalWithMetadata | null;
		tradersUnion: SignalWithMetadata | null;
		tradeFlow: SignalWithMetadata | null; // CVD + large order bias
		whaleLeaders: SignalWithMetadata | null; // Polymarket top traders
		liquidations: SignalWithMetadata | null; // Liquidation imbalance (LONG vs SHORT)
	};
	// Extended data for UI analytics
	extended: {
		orderBook?: {
			bidVolume: number;
			askVolume: number;
			bestBid: number;
			bestAsk: number;
		};
		tradeFlow?: {
			cvdValue: number;
			largeOrderBias: number;
			buyVolume: number;
			sellVolume: number;
		};
		whales?: {
			bullishCount: number;
			bearishCount: number;
			totalWeight: number;
		};
		liquidations?: {
			longLiquidations: number;
			shortLiquidations: number;
		};
	};
	price: number;
}

export interface SmartMoneyPrediction {
	symbol: string;
	windowStart: number;
	direction: "UP" | "DOWN" | "NEUTRAL";
	confidence: number;
	score: number;
	openPrice: number; // Price at window open (Phase 1)
	entryPrice: number; // Price when prediction was made
	predictedAt: number; // When prediction was made
	phase: 1 | 2 | 3; // Which phase triggered the prediction
	signals: {
		lsRatio?: number;
		lsFreshness?: number;
		orderBookImbalance?: number;
		orderBookFreshness?: number;
		tvTechRating?: number;
		tvFreshness?: number;
		tuScore?: number;
		tuFreshness?: number;
	};
	dataCompleteness: number;
}

export interface SmartMoneyPredictionBatch {
	windowStart: number;
	phase: 1 | 2 | 3;
	predictions: SmartMoneyPrediction[];
	timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// WINDOW STATE
// ═══════════════════════════════════════════════════════════════════════════

interface WindowState {
	windowStart: number;
	openPrices: Map<string, number>; // Captured at Phase 1
	predictedSymbols: Set<string>; // Already predicted this window
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOWED SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_SYMBOLS = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"]);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculateFreshnessScore(
	signalTimestamp: number,
	inferenceTimestamp: number,
	config: SignalFreshnessConfig,
): number {
	const age = (inferenceTimestamp - signalTimestamp) / 1000;
	if (age > config.maxAge) {
		return config.requireFresh ? 0 : 0.1;
	}
	return 0.5 ** (age / config.halfLife);
}

function normalizeLS(ratio: number): number {
	// Contrarian signal: high ratio (crowd long) = bearish
	if (ratio > 1.5) return -1;
	if (ratio < 0.67) return 1;
	// Linear interpolation between 0.67 and 1.5
	return (1.0 - ratio) / 0.5;
}

function normalizeTVSignal(tvData: any): number {
	if (!tvData || !Array.isArray(tvData)) return 0;
	// Index 2 = TechRating_1D, Index 8 = RSI
	const techRating = typeof tvData[2] === "number" ? tvData[2] : 0;
	const rsi = typeof tvData[8] === "number" ? tvData[8] : 50;
	const normalizedRsi = (rsi - 50) / 50;
	return techRating * 0.7 + normalizedRsi * 0.3;
}

function normalizeTUSignal(tuData: any): number {
	if (!tuData?.m15) return 0;
	const m15 = tuData.m15;
	let score = 0;

	// Forecast direction
	if (m15.forecast === "buy") score += 0.5;
	else if (m15.forecast === "sell") score -= 0.5;

	// TA balance
	if (m15.ta) {
		const total = m15.ta.buy + m15.ta.sell + m15.ta.neutral;
		if (total > 0) {
			score += ((m15.ta.buy - m15.ta.sell) / total) * 0.5;
		}
	}

	return Math.max(-1, Math.min(1, score));
}

function normalizeSymbol(rawSymbol: string): string {
	// Normalize BTC-USDT, BTCUSDT, etc to BTCUSDT
	return rawSymbol.replace("-", "").toUpperCase();
}

function mapTVSymbol(rawSymbol: string): string | null {
	// CRYPTO:BTCUSD -> BTCUSDT
	if (rawSymbol.includes("BTC")) return "BTCUSDT";
	if (rawSymbol.includes("ETH")) return "ETHUSDT";
	if (rawSymbol.includes("SOL")) return "SOLUSDT";
	if (rawSymbol.includes("XRP")) return "XRPUSDT";
	return null;
}

/**
 * Normalize liquidation symbols from various exchanges to XXXUSDT format
 * Handles: BTCUSDT, BTC-USDT, BTCUSD, BTC/USDT, BTC-USD-PERP, XBTUSD, etc.
 */
function normalizeLiquidationSymbol(rawSymbol: string): string | null {
	const upper = rawSymbol.toUpperCase();

	// Remove common suffixes and separators
	const cleaned = upper
		.replace(/-PERP$/i, "")
		.replace(/_PERP$/i, "")
		.replace(/[-_/]/g, ""); // Remove separators

	// Map XBT -> BTC (BitMEX uses XBT)
	const mapped = cleaned.replace(/^XBT/, "BTC");

	// Extract base asset
	let base: string | null = null;
	if (mapped.startsWith("BTC")) base = "BTC";
	else if (mapped.startsWith("ETH")) base = "ETH";
	else if (mapped.startsWith("SOL")) base = "SOL";
	else if (mapped.startsWith("XRP")) base = "XRP";

	if (!base) return null;

	// Always return as XXXUSDT
	return `${base}USDT`;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

export class SmartMoneyPredictionStage extends PipelineStage<
	any,
	SmartMoneyPredictionBatch
> {
	id = "smart-money-prediction";
	description = "Phased prediction: waits for confidence before predicting";
	inputs = [
		"interval-ticker-source",
		"binance-ls-aggregated",
		"tradingview-tech-source",
		"traders-union-source",
		"normalized-books",
		"trade-flow",
		"crypto-profitability-update", // Polymarket top traders
		"liquidations-source", // Binance/Bybit/OKX/Deribit/BitMEX liquidations
	];
	output = "smart-money-predictions";

	// Internal state buffer (NOT emitted on every update)
	private state: Map<string, SmartMoneyCandidateV2> = new Map();
	private weights: NetworkWeights = DEFAULT_WEIGHTS;

	// Window tracking for phased predictions
	private currentWindow: WindowState | null = null;

	constructor() {
		super();
		// Initialize state for allowed symbols
		for (const symbol of ALLOWED_SYMBOLS) {
			this.state.set(symbol, {
				symbol,
				signals: {
					lsRatio: null,
					orderBook: null,
					tvTech: null,
					tradersUnion: null,
					tradeFlow: null,
					whaleLeaders: null,
					liquidations: null,
				},
				extended: {},
				price: 0,
			});
		}
	}

	public async process(
		data: any,
		context: ProcessingContext,
	): Promise<SmartMoneyPredictionBatch | null> {
		const topic = context.topic;
		const now = Date.now();

		// ═══════════════════════════════════════════════════════════════════════
		// TRIGGER: Phased tick -> Evaluate if we should predict
		// ═══════════════════════════════════════════════════════════════════════
		if (topic === "interval-ticker-source") {
			const tick = data as PhasedTickEvent;
			return this.handlePhasedTick(tick, now);
		}

		// ═══════════════════════════════════════════════════════════════════════
		// PASSIVE COLLECTION: Update internal state, do NOT emit
		// ═══════════════════════════════════════════════════════════════════════

		// 1. Binance Long/Short
		if (topic === "binance-ls-aggregated") {
			const agg = data as AggregatedLongShort;
			for (const [symbol, metrics] of Object.entries(agg)) {
				if (!ALLOWED_SYMBOLS.has(symbol)) continue;

				const candidate = this.state.get(symbol);
				if (candidate) {
					candidate.signals.lsRatio = {
						value: metrics.ratio,
						timestamp: now,
						source: "binance-ls",
					};
				}
			}
			return null; // DO NOT EMIT
		}

		// 2. Normalized Order Books
		if (topic === "normalized-books") {
			const book = data as NormalizedOrderBook;
			const symbol = normalizeSymbol(book.symbol);

			if (!ALLOWED_SYMBOLS.has(symbol)) return null;

			const candidate = this.state.get(symbol);
			if (candidate) {
				const bestBid = book.bids.length > 0 ? book.bids[0]?.[0] : 0;
				const bestAsk = book.asks.length > 0 ? book.asks[0]?.[0] : 0;
				candidate.price = (bestBid + bestAsk) / 2;

				// Calculate imbalance from top 5 levels
				let bidVol = 0,
					askVol = 0;
				for (let i = 0; i < Math.min(book.bids.length, 5); i++)
					bidVol += book.bids[i]?.[1];
				for (let i = 0; i < Math.min(book.asks.length, 5); i++)
					askVol += book.asks[i]?.[1];

				const imbalance =
					bidVol + askVol > 0 ? (bidVol - askVol) / (bidVol + askVol) : 0;

				candidate.signals.orderBook = {
					value: imbalance,
					timestamp: now,
					source: "orderbook",
				};

				// Store extended OrderBook data for UI
				candidate.extended.orderBook = {
					bidVolume: bidVol,
					askVolume: askVol,
					bestBid,
					bestAsk,
				};
			}
			return null; // DO NOT EMIT
		}

		// 3. TradingView Technicals
		if (topic === "tradingview-tech-source") {
			const tvEvent = data as TradingViewTechEvent;

			for (const item of tvEvent.data) {
				const symbol = mapTVSymbol(item.s);
				if (!symbol || !ALLOWED_SYMBOLS.has(symbol)) continue;

				const candidate = this.state.get(symbol);
				if (candidate) {
					candidate.signals.tvTech = {
						value: normalizeTVSignal(item.d),
						timestamp: now,
						source: "tradingview",
					};
				}
			}
			return null; // DO NOT EMIT
		}

		// 4. Traders Union
		if (topic === "traders-union-source") {
			const tuEvent = data as TradersUnionEvent;

			// Currently only BTC (ticker_id 149)
			if (tuEvent.data.ticker_id === 149) {
				const candidate = this.state.get("BTCUSDT");
				if (candidate) {
					candidate.signals.tradersUnion = {
						value: normalizeTUSignal(tuEvent.data),
						timestamp: now,
						source: "traders-union",
					};
				}
			}
			return null; // DO NOT EMIT
		}

		// 5. Trade Flow (CVD + Large Orders)
		if (topic === "trade-flow") {
			const flow = data as TradeFlowMetrics;
			const symbol = flow.symbol;

			if (!ALLOWED_SYMBOLS.has(symbol)) return null;

			const candidate = this.state.get(symbol);
			if (candidate) {
				// Combine CVD normalized + large order bias (both -1 to 1)
				// CVD is more important (70%), large orders secondary (30%)
				const combinedSignal =
					flow.cvdNormalized * 0.7 + flow.largeOrderBias * 0.3;

				candidate.signals.tradeFlow = {
					value: combinedSignal,
					timestamp: now,
					source: "trade-flow",
				};

				// Store extended TradeFlow data for UI
				candidate.extended.tradeFlow = {
					cvdValue: flow.cvdNormalized,
					largeOrderBias: flow.largeOrderBias,
					buyVolume: flow.buyVolume ?? 0,
					sellVolume: flow.sellVolume ?? 0,
				};

				// Also update price from trade flow if more recent
				if (flow.lastPrice > 0) {
					candidate.price = flow.lastPrice;
				}
			}
			return null; // DO NOT EMIT
		}

		// 6. Whale Leaders (Polymarket top traders with PnL)
		if (topic === "crypto-profitability-update") {
			const snapshot = data as ProfitabilitySnapshot;

			// Map asset symbols: BTC -> BTCUSDT
			const symbolMap: Record<string, string> = {
				BTC: "BTCUSDT",
				ETH: "ETHUSDT",
				SOL: "SOLUSDT",
				XRP: "XRPUSDT",
			};

			// Aggregate whale consensus per symbol
			// Only count traders with positive PnL (they're right relative to priceToBeat!)
			const assetSignals = new Map<
				string,
				{ bullish: number; bearish: number; totalWeight: number }
			>();

			for (const perf of snapshot.performances) {
				const symbol = symbolMap[perf.asset];
				if (!symbol || !ALLOWED_SYMBOLS.has(symbol)) continue;

				// Skip traders with negative PnL - they're wrong
				if (!perf.isProfitable) continue;

				// Calculate weight based on RANK and SIZE
				// Rank scoring: Top 10 = 3x, Top 25 = 2x, Top 50 = 1.5x, 50+ = 1x
				let rankMultiplier = 1.0;
				if (perf.userRank <= 5) {
					rankMultiplier = 4.0; // Top 5 = 4x weight (elite whales)
				} else if (perf.userRank <= 10) {
					rankMultiplier = 3.0; // Top 10 = 3x weight
				} else if (perf.userRank <= 25) {
					rankMultiplier = 2.0; // Top 25 = 2x weight
				} else if (perf.userRank <= 50) {
					rankMultiplier = 1.5; // Top 50 = 1.5x weight
				}

				// Base weight by size (larger positions = more conviction)
				const sizeWeight = Math.min(perf.totalSize, 10000); // Cap at 10k

				// Final weight = size × rank multiplier
				const weight = sizeWeight * rankMultiplier;

				const existing = assetSignals.get(symbol) || {
					bullish: 0,
					bearish: 0,
					totalWeight: 0,
				};

				const outcomeUpper = perf.outcome.toUpperCase();
				if (outcomeUpper === "UP" || outcomeUpper === "YES") {
					existing.bullish += weight;
				} else if (outcomeUpper === "DOWN" || outcomeUpper === "NO") {
					existing.bearish += weight;
				}
				existing.totalWeight += weight;
				assetSignals.set(symbol, existing);

				logger.trace(
					{
						symbol,
						user: perf.user,
						rank: perf.userRank,
						rankMultiplier,
						size: perf.totalSize,
						weight: weight.toFixed(0),
						direction: outcomeUpper,
						priceToBeat: perf.priceToBeat,
						currentPrice: perf.currentSpotPrice,
					},
					"Whale vote weighted by rank",
				);
			}

			// Update candidates with whale consensus
			// Track bullish/bearish counts per symbol
			const whaleCounts = new Map<
				string,
				{ bullishCount: number; bearishCount: number }
			>();

			for (const perf of snapshot.performances) {
				const symb = symbolMap[perf.asset];
				if (!symb || !ALLOWED_SYMBOLS.has(symb)) continue;
				if (!perf.isProfitable) continue;

				const existing = whaleCounts.get(symb) || {
					bullishCount: 0,
					bearishCount: 0,
				};
				const outcomeUp = perf.outcome.toUpperCase();
				if (outcomeUp === "UP" || outcomeUp === "YES") {
					existing.bullishCount++;
				} else if (outcomeUp === "DOWN" || outcomeUp === "NO") {
					existing.bearishCount++;
				}
				whaleCounts.set(symb, existing);
			}

			for (const [symbol, signals] of assetSignals.entries()) {
				const candidate = this.state.get(symbol);
				if (!candidate || signals.totalWeight === 0) continue;

				// Calculate consensus: -1 (all bearish) to +1 (all bullish)
				const consensus =
					(signals.bullish - signals.bearish) / signals.totalWeight;

				candidate.signals.whaleLeaders = {
					value: consensus,
					timestamp: now,
					source: "whale-leaders",
				};

				// Store extended whale data for UI
				const counts = whaleCounts.get(symbol) || {
					bullishCount: 0,
					bearishCount: 0,
				};
				candidate.extended.whales = {
					bullishCount: counts.bullishCount,
					bearishCount: counts.bearishCount,
					totalWeight: signals.totalWeight,
				};

				logger.debug(
					{
						symbol,
						consensus: consensus.toFixed(3),
						bullish: signals.bullish.toFixed(0),
						bearish: signals.bearish.toFixed(0),
					},
					"Whale leaders signal updated",
				);
			}
			return null; // DO NOT EMIT
		}

		// 7. Liquidations (Binance/Bybit/OKX/Deribit/BitMEX)
		// LONG liquidations = bearish (longs getting rekt = price going down)
		// SHORT liquidations = bullish (shorts getting rekt = price going up)
		if (topic === "liquidations-source") {
			const liq = data as Liquidation & { type?: string };
			if (liq.type !== "liquidation") return null;

			// Normalize symbol to XXXUSDT format
			// Handles: BTCUSDT, BTC-USDT, BTCUSD, BTC/USDT, BTC-USD-PERP, XBTUSD, etc.
			const normalizedSymbol = normalizeLiquidationSymbol(liq.symbol);

			if (!normalizedSymbol || !ALLOWED_SYMBOLS.has(normalizedSymbol)) {
				logger.trace(
					{ raw: liq.symbol, normalized: normalizedSymbol },
					"Liquidation symbol not in ALLOWED_SYMBOLS",
				);
				return null;
			}

			const candidate = this.state.get(normalizedSymbol);
			if (!candidate) return null;

			// Get existing liquidation signal or create new
			const existing = candidate.signals.liquidations;
			const existingValue = existing?.value ?? 0;

			// Decay factor for old signal (half every 30 seconds)
			const age = existing ? (now - existing.timestamp) / 1000 : 60;
			const decayFactor = Math.exp(-age / 30);
			const decayedValue = existingValue * decayFactor;

			// Calculate impact of this liquidation
			// Normalize by value (larger liquidations = stronger signal)
			// Typically liquidations are in thousands of USD
			const normalizedValue = Math.min(liq.value / 100000, 1); // Cap at 100k USD

			// LONG liq = bearish (-1), SHORT liq = bullish (+1)
			const direction = liq.side === "LONG" ? -1 : 1;
			const impact = direction * normalizedValue;

			// Combine with decayed previous value
			const newValue = Math.max(-1, Math.min(1, decayedValue + impact * 0.3));

			candidate.signals.liquidations = {
				value: newValue,
				timestamp: now,
				source: "liquidations",
			};

			// Update extended liquidations data for UI
			const extLiq = candidate.extended.liquidations || {
				longLiquidations: 0,
				shortLiquidations: 0,
			};
			if (liq.side === "LONG") {
				extLiq.longLiquidations += liq.value;
			} else {
				extLiq.shortLiquidations += liq.value;
			}
			candidate.extended.liquidations = extLiq;

			logger.debug(
				{
					symbol: normalizedSymbol,
					exchange: liq.exchange,
					side: liq.side,
					value: liq.value.toFixed(0),
					impact: impact.toFixed(3),
					signal: newValue.toFixed(3),
				},
				"Liquidation signal updated",
			);

			return null; // DO NOT EMIT
		}

		return null;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// PHASED PREDICTION LOGIC
	// ═══════════════════════════════════════════════════════════════════════════

	private handlePhasedTick(
		tick: PhasedTickEvent,
		now: number,
	): SmartMoneyPredictionBatch | null {
		const { windowStart, phase, isWindowOpen, isDeadline } = tick;

		// ─────────────────────────────────────────────────────────────────────────
		// NEW WINDOW: Reset state and capture open prices
		// ─────────────────────────────────────────────────────────────────────────
		if (!this.currentWindow || this.currentWindow.windowStart !== windowStart) {
			this.currentWindow = {
				windowStart,
				openPrices: new Map(),
				predictedSymbols: new Set(),
			};

			// Capture open prices for all symbols
			for (const symbol of ALLOWED_SYMBOLS) {
				const candidate = this.state.get(symbol);
				if (candidate && candidate.price > 0) {
					this.currentWindow.openPrices.set(symbol, candidate.price);
				}
			}

			logger.info(
				{
					windowStart: new Date(windowStart).toISOString(),
					openPrices: Object.fromEntries(this.currentWindow.openPrices),
				},
				"New prediction window opened",
			);
		}

		// ─────────────────────────────────────────────────────────────────────────
		// EVALUATE: Which symbols are ready to predict?
		// ─────────────────────────────────────────────────────────────────────────
		const confidenceThreshold = PHASE_CONFIDENCE_THRESHOLDS[phase];
		const predictions: SmartMoneyPrediction[] = [];

		for (const symbol of ALLOWED_SYMBOLS) {
			// Skip if already predicted this window
			if (this.currentWindow.predictedSymbols.has(symbol)) continue;

			const candidate = this.state.get(symbol);
			if (!candidate) continue;

			const openPrice = this.currentWindow.openPrices.get(symbol);
			if (!openPrice) continue; // No open price = can't evaluate

			// Try forward pass
			const prediction = this.forwardPass(
				candidate,
				windowStart,
				now,
				phase,
				openPrice,
			);

			if (!prediction) continue;

			// Check if confidence meets threshold - NO FORCED PREDICTIONS
			// Profit > prediction count. If not confident enough, skip.
			const meetsThreshold = prediction.confidence >= confidenceThreshold;

			if (meetsThreshold) {
				predictions.push(prediction);
				this.currentWindow.predictedSymbols.add(symbol);

				logger.info(
					{
						symbol,
						phase,
						confidence: prediction.confidence.toFixed(1),
						direction: prediction.direction,
						openPrice,
						entryPrice: prediction.entryPrice,
					},
					`Prediction made in Phase ${phase}`,
				);
			} else {
				logger.debug(
					{
						symbol,
						phase,
						confidence: prediction.confidence.toFixed(1),
						threshold: confidenceThreshold,
					},
					"Skipped - confidence below threshold",
				);
			}
		}

		// Only emit if we have predictions
		if (predictions.length === 0) {
			logger.debug(
				{ phase, windowStart: new Date(windowStart).toISOString() },
				"No predictions ready this phase",
			);
			return null;
		}

		logger.info(
			{
				phase,
				windowStart: new Date(windowStart).toISOString(),
				count: predictions.length,
				symbols: predictions.map((p) => `${p.symbol}:${p.direction}`),
			},
			"Emitting predictions batch to storage",
		);

		return {
			windowStart,
			phase,
			predictions,
			timestamp: now,
		};
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// FORWARD PASS: Compute prediction for a symbol
	// ═══════════════════════════════════════════════════════════════════════════

	private forwardPass(
		candidate: SmartMoneyCandidateV2,
		windowStart: number,
		inferenceTime: number,
		phase: 1 | 2 | 3,
		openPrice: number,
	): SmartMoneyPrediction | null {
		const sym = candidate.symbol;

		// ═══════════════════════════════════════════════════════════════════════
		// LAYER 0.5: Freshness Scoring
		// ═══════════════════════════════════════════════════════════════════════
		const freshness = {
			ls: candidate.signals.lsRatio
				? calculateFreshnessScore(
						candidate.signals.lsRatio.timestamp,
						inferenceTime,
						FRESHNESS_CONFIG["binance-ls"]!,
					)
				: 0,
			book: candidate.signals.orderBook
				? calculateFreshnessScore(
						candidate.signals.orderBook.timestamp,
						inferenceTime,
						FRESHNESS_CONFIG.orderbook!,
					)
				: 0,
			tv: candidate.signals.tvTech
				? calculateFreshnessScore(
						candidate.signals.tvTech.timestamp,
						inferenceTime,
						FRESHNESS_CONFIG.tradingview!,
					)
				: 0,
			tu: candidate.signals.tradersUnion
				? calculateFreshnessScore(
						candidate.signals.tradersUnion.timestamp,
						inferenceTime,
						FRESHNESS_CONFIG["traders-union"]!,
					)
				: 0,
			flow: candidate.signals.tradeFlow
				? calculateFreshnessScore(
						candidate.signals.tradeFlow.timestamp,
						inferenceTime,
						FRESHNESS_CONFIG["trade-flow"]!,
					)
				: 0,
			whale: candidate.signals.whaleLeaders
				? calculateFreshnessScore(
						candidate.signals.whaleLeaders.timestamp,
						inferenceTime,
						FRESHNESS_CONFIG["whale-leaders"]!,
					)
				: 0,
			liq: candidate.signals.liquidations
				? calculateFreshnessScore(
						candidate.signals.liquidations.timestamp,
						inferenceTime,
						FRESHNESS_CONFIG.liquidations!,
					)
				: 0,
		};

		// Data completeness check
		const freshnessValues = Object.values(freshness);
		const dataCompleteness =
			freshnessValues.reduce((a, b) => a + b, 0) / freshnessValues.length;

		// Skip if insufficient data
		const activeSignals = freshnessValues.filter((f) => f > 0.1).length;
		if (activeSignals < 2) {
			logger.debug(
				{ symbol: sym, activeSignals },
				"Insufficient signals, skipping",
			);
			return null;
		}

		// ═══════════════════════════════════════════════════════════════════════
		// LAYER 1: Signal Normalization (already done during collection)
		// ═══════════════════════════════════════════════════════════════════════
		const L1 = {
			ls: candidate.signals.lsRatio
				? normalizeLS(candidate.signals.lsRatio.value)
				: 0,
			book: candidate.signals.orderBook?.value ?? 0,
			tv: candidate.signals.tvTech?.value ?? 0,
			tu: candidate.signals.tradersUnion?.value ?? 0,
			flow: candidate.signals.tradeFlow?.value ?? 0, // Already normalized in aggregation
			whale: candidate.signals.whaleLeaders?.value ?? 0, // Already normalized (-1 to 1)
			liq: candidate.signals.liquidations?.value ?? 0, // Already normalized (-1 to 1)
		};

		// ═══════════════════════════════════════════════════════════════════════
		// LAYER 2: Source × Symbol × Freshness × Phase Weighting
		// ═══════════════════════════════════════════════════════════════════════
		const phaseMultipliers = PHASE_WEIGHT_MULTIPLIERS.find(
			(p) => p.phase === phase,
		)?.multipliers ?? {
			"binance-ls": 1.0,
			orderbook: 1.0,
			tradingview: 1.0,
			"traders-union": 1.0,
			"trade-flow": 1.0,
			"whale-leaders": 1.0,
			liquidations: 1.0,
		};

		const L2 = {
			ls:
				L1.ls *
				(this.weights.source["binance-ls"]?.[sym] ?? 0.25) *
				freshness.ls *
				phaseMultipliers["binance-ls"],
			book:
				L1.book *
				(this.weights.source.orderbook?.[sym] ?? 0.15) *
				freshness.book *
				phaseMultipliers.orderbook,
			tv:
				L1.tv *
				(this.weights.source.tradingview?.[sym] ?? 0.25) *
				freshness.tv *
				phaseMultipliers.tradingview,
			tu:
				L1.tu *
				(this.weights.source["traders-union"]?.[sym] ?? 0.25) *
				freshness.tu *
				phaseMultipliers["traders-union"],
			flow:
				L1.flow *
				(this.weights.source["trade-flow"]?.[sym] ?? 0.3) *
				freshness.flow *
				(phaseMultipliers["trade-flow"] ?? 1.0),
			whale:
				L1.whale *
				(this.weights.source["whale-leaders"]?.[sym] ?? 0.35) *
				freshness.whale *
				(phaseMultipliers["whale-leaders"] ?? 1.0),
			liq:
				L1.liq *
				(this.weights.source.liquidations?.[sym] ?? 0.25) *
				freshness.liq *
				(phaseMultipliers.liquidations ?? 1.0),
		};

		// ═══════════════════════════════════════════════════════════════════════
		// LAYER 4: Aggregation with Dynamic Normalization
		// ═══════════════════════════════════════════════════════════════════════
		const rawScore =
			L2.ls + L2.book + L2.tv + L2.tu + L2.flow + L2.whale + L2.liq;

		// Normalize by total freshness to avoid under-weighting
		const totalFreshness =
			freshness.ls +
			freshness.book +
			freshness.tv +
			freshness.tu +
			freshness.flow +
			freshness.whale +
			freshness.liq;
		const normalizedScore = totalFreshness > 0 ? rawScore / totalFreshness : 0;

		// ═══════════════════════════════════════════════════════════════════════
		// LAYER 5: Decision Threshold
		// ═══════════════════════════════════════════════════════════════════════
		let direction: "UP" | "DOWN" | "NEUTRAL";
		if (normalizedScore > this.weights.threshold.up) direction = "UP";
		else if (normalizedScore < this.weights.threshold.down) direction = "DOWN";
		else direction = "NEUTRAL";

		const rawConfidence = Math.min(100, Math.abs(normalizedScore) * 100);
		const confidence = rawConfidence * dataCompleteness ** 0.5;

		return {
			symbol: sym,
			windowStart,
			direction,
			confidence,
			score: normalizedScore,
			openPrice, // Price at window open
			entryPrice: candidate.price, // Current price when predicting
			predictedAt: inferenceTime, // When we made this prediction
			phase, // Which phase triggered it
			signals: {
				lsRatio: candidate.signals.lsRatio?.value,
				lsFreshness: freshness.ls,
				orderBookImbalance: candidate.signals.orderBook?.value,
				orderBookFreshness: freshness.book,
				tvTechRating: candidate.signals.tvTech?.value,
				tvFreshness: freshness.tv,
				tuScore: candidate.signals.tradersUnion?.value,
				tuFreshness: freshness.tu,
			},
			dataCompleteness,
		};
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// REAL-TIME STATE FOR UI
	// ═══════════════════════════════════════════════════════════════════════════

	public getRealTimeState(): SmartMoneyRealTimeState {
		const now = Date.now();
		const currentPhase = this.getCurrentPhase();
		const symbols: SmartMoneySymbolState[] = [];

		for (const symbol of ALLOWED_SYMBOLS) {
			const candidate = this.state.get(symbol);
			if (!candidate) continue;

			const openPrice = this.currentWindow?.openPrices.get(symbol) ?? 0;
			const alreadyPredicted =
				this.currentWindow?.predictedSymbols.has(symbol) ?? false;

			// Calculate current signals strength using current phase
			const prediction =
				openPrice > 0
					? this.forwardPass(
							candidate,
							this.currentWindow?.windowStart ?? now,
							now,
							currentPhase,
							openPrice,
						)
					: null;

			symbols.push({
				symbol,
				currentPrice: candidate.price,
				openPrice,
				priceChange:
					openPrice > 0 ? ((candidate.price - openPrice) / openPrice) * 100 : 0,
				signals: {
					lsRatio: candidate.signals.lsRatio?.value ?? null,
					lsAge: candidate.signals.lsRatio
						? (now - candidate.signals.lsRatio.timestamp) / 1000
						: null,
					orderBookImbalance: candidate.signals.orderBook?.value ?? null,
					orderBookAge: candidate.signals.orderBook
						? (now - candidate.signals.orderBook.timestamp) / 1000
						: null,
					tvTechRating: candidate.signals.tvTech?.value ?? null,
					tvAge: candidate.signals.tvTech
						? (now - candidate.signals.tvTech.timestamp) / 1000
						: null,
					tuScore: candidate.signals.tradersUnion?.value ?? null,
					tuAge: candidate.signals.tradersUnion
						? (now - candidate.signals.tradersUnion.timestamp) / 1000
						: null,
					tradeFlow: candidate.signals.tradeFlow?.value ?? null,
					tradeFlowAge: candidate.signals.tradeFlow
						? (now - candidate.signals.tradeFlow.timestamp) / 1000
						: null,
					whaleLeaders: candidate.signals.whaleLeaders?.value ?? null,
					whaleLeadersAge: candidate.signals.whaleLeaders
						? (now - candidate.signals.whaleLeaders.timestamp) / 1000
						: null,
					liquidations: candidate.signals.liquidations?.value ?? null,
					liquidationsAge: candidate.signals.liquidations
						? (now - candidate.signals.liquidations.timestamp) / 1000
						: null,
				},
				// Extended analytics for UI
				extended: this.buildExtendedData(candidate),
				score: prediction?.score ?? 0,
				confidence: prediction?.confidence ?? 0,
				potentialDirection: prediction?.direction ?? "NEUTRAL",
				distanceToThreshold:
					PHASE_CONFIDENCE_THRESHOLDS[currentPhase] -
					(prediction?.confidence ?? 0), // How far from phase threshold
				alreadyPredicted,
			});
		}

		const currentThreshold = PHASE_CONFIDENCE_THRESHOLDS[currentPhase];

		return {
			windowStart: this.currentWindow?.windowStart ?? 0,
			currentPhase,
			phaseProgress: this.getPhaseProgress(),
			threshold: currentThreshold, // Dynamic threshold per phase
			thresholds: { ...PHASE_CONFIDENCE_THRESHOLDS }, // All thresholds for UI
			symbols,
			timestamp: now,
		};
	}

	// Build extended data for UI from candidate
	private buildExtendedData(candidate: SmartMoneyCandidateV2) {
		const ext = candidate.extended;
		const result: any = {};

		// OrderBook extended
		if (ext.orderBook) {
			const spread = ext.orderBook.bestAsk - ext.orderBook.bestBid;
			const spreadPercent =
				ext.orderBook.bestBid > 0 ? (spread / ext.orderBook.bestBid) * 100 : 0;
			result.orderBook = {
				bidVolume: ext.orderBook.bidVolume,
				askVolume: ext.orderBook.askVolume,
				bestBid: ext.orderBook.bestBid,
				bestAsk: ext.orderBook.bestAsk,
				spread,
				spreadPercent,
			};
		}

		// Long/Short extended
		if (candidate.signals.lsRatio) {
			const ratio = candidate.signals.lsRatio.value;
			const longPercent = (ratio / (ratio + 1)) * 100;
			const shortPercent = 100 - longPercent;
			result.longShort = {
				longPercent,
				shortPercent,
				crowdBias: ratio > 1.3 ? "LONG" : ratio < 0.77 ? "SHORT" : "NEUTRAL",
			};
		}

		// TradeFlow extended
		if (ext.tradeFlow) {
			result.tradeFlow = {
				cvdValue: ext.tradeFlow.cvdValue,
				largeOrderBias: ext.tradeFlow.largeOrderBias,
				buyVolume: ext.tradeFlow.buyVolume,
				sellVolume: ext.tradeFlow.sellVolume,
			};
		}

		// Whales extended
		if (ext.whales) {
			result.whales = {
				bullishCount: ext.whales.bullishCount,
				bearishCount: ext.whales.bearishCount,
				topWhaleDirection:
					ext.whales.bullishCount > ext.whales.bearishCount
						? "UP"
						: ext.whales.bullishCount < ext.whales.bearishCount
							? "DOWN"
							: "NEUTRAL",
				totalWeight: ext.whales.totalWeight,
			};
		}

		// Liquidations extended
		if (ext.liquidations) {
			const total =
				ext.liquidations.longLiquidations + ext.liquidations.shortLiquidations;
			result.liquidations = {
				longLiquidations: ext.liquidations.longLiquidations,
				shortLiquidations: ext.liquidations.shortLiquidations,
				cascadeRisk:
					total > 1000000 ? "HIGH" : total > 100000 ? "MEDIUM" : "LOW",
			};
		}

		return Object.keys(result).length > 0 ? result : undefined;
	}

	private getCurrentPhase(): 1 | 2 | 3 {
		const now = Date.now();
		const PHASE_MS = 5 * 60 * 1000;
		const WINDOW_MS = 15 * 60 * 1000;
		const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
		const elapsed = now - windowStart;
		return (Math.floor(elapsed / PHASE_MS) + 1) as 1 | 2 | 3;
	}

	private getPhaseProgress(): number {
		const now = Date.now();
		const PHASE_MS = 5 * 60 * 1000;
		const WINDOW_MS = 15 * 60 * 1000;
		const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
		const elapsed = now - windowStart;
		const phaseElapsed = elapsed % PHASE_MS;
		return (phaseElapsed / PHASE_MS) * 100;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// WEIGHT MANAGEMENT (for future learning)
	// ═══════════════════════════════════════════════════════════════════════════

	public setWeights(weights: NetworkWeights) {
		this.weights = weights;
	}

	public getWeights(): NetworkWeights {
		return this.weights;
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL-TIME STATE TYPES (for UI)
// ═══════════════════════════════════════════════════════════════════════════

export interface SmartMoneySymbolState {
	symbol: string;
	currentPrice: number;
	openPrice: number;
	priceChange: number;
	signals: {
		lsRatio: number | null;
		lsAge: number | null;
		orderBookImbalance: number | null;
		orderBookAge: number | null;
		tvTechRating: number | null;
		tvAge: number | null;
		tuScore: number | null;
		tuAge: number | null;
		tradeFlow: number | null;
		tradeFlowAge: number | null;
		whaleLeaders: number | null;
		whaleLeadersAge: number | null;
		liquidations: number | null;
		liquidationsAge: number | null;
	};
	score: number;
	confidence: number;
	potentialDirection: "UP" | "DOWN" | "NEUTRAL";
	distanceToThreshold: number;
	alreadyPredicted: boolean;
}

export interface SmartMoneyRealTimeState {
	windowStart: number;
	currentPhase: 1 | 2 | 3;
	phaseProgress: number;
	threshold: number; // Current phase threshold
	thresholds: { 1: number; 2: number; 3: number }; // All phase thresholds
	symbols: SmartMoneySymbolState[];
	timestamp: number;
}
