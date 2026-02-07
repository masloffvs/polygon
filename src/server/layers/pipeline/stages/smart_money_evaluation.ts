import { logger } from "../../../utils/logger";
import type { AggTradeEvent } from "../../sources/binance_aggtrade";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { SmartMoneyPredictionBatch } from "./smart_money_prediction";

export interface SmartMoneyOutcome {
	symbol: string;
	windowStart: number;
	phase: number;
	direction: "UP" | "DOWN" | "NEUTRAL";
	predictedAt: number;
	entryPrice: number;
	closePrice: number;
	maxPrice: number; // Highest price reached during window
	minPrice: number; // Lowest price reached during window
	pnlPercent: number;
	isWin: boolean;
	score: number;
	confidence: number;
}

export interface SmartMoneyEvaluationResult {
	windowStart: number;
	outcomes: SmartMoneyOutcome[];
}

interface ActiveWindow {
	windowStart: number;
	predictions: Map<
		string,
		{
			prediction: any;
			maxPrice: number;
			minPrice: number;
			closePrice: number;
		}
	>;
}

export class SmartMoneyEvaluationStage extends PipelineStage<
	SmartMoneyPredictionBatch | AggTradeEvent,
	SmartMoneyEvaluationResult
> {
	id = "smart-money-evaluation";
	description =
		"Evaluates Smart Money predictions against realized price action";
	inputs = ["smart-money-predictions", "binance-aggtrade-source"];
	output = "smart-money-outcomes";

	// Keep active windows for a bit to allow late data or grace period
	// Key: windowStart timestamp
	private activeWindows = new Map<number, ActiveWindow>();

	// 15 minutes in ms
	private readonly WINDOW_DURATION = 15 * 60 * 1000;

	public async process(
		data: SmartMoneyPredictionBatch | AggTradeEvent,
		context: ProcessingContext,
	): Promise<SmartMoneyEvaluationResult | null> {
		// 1. Handle New Predictions
		if (context.topic === "smart-money-predictions") {
			const batch = data as SmartMoneyPredictionBatch;
			const windowStart = batch.windowStart;

			if (!this.activeWindows.has(windowStart)) {
				this.activeWindows.set(windowStart, {
					windowStart,
					predictions: new Map(),
				});
			}

			const window = this.activeWindows.get(windowStart)!;

			for (const pred of batch.predictions) {
				// Only track directional predictions
				if (pred.direction === "NEUTRAL") continue;

				// key = symbol + phase (treat different phase predictions as updates or distinct?)
				// Let's track the *latest* or *first*?
				// Typically we want to know if the prediction made at Phase X was correct.
				// Let's use a unique key for tracking specific prediction instances if needed,
				// but for now let's key by Symbol and assume we update/refine.
				// Actually, distinct predictions per phase might be interesting.
				// User wants "Prediction History".

				// Let's just store by Symbol for now, overwriting if newer one comes in same window?
				// No, Phase 1 prediction is distinct from Phase 3.
				// Let's verify implementation of SmartMoneyPrediction: it emits batches.

				// Key: symbol
				if (!window.predictions.has(pred.symbol)) {
					window.predictions.set(pred.symbol, {
						prediction: pred,
						maxPrice: pred.entryPrice,
						minPrice: pred.entryPrice,
						closePrice: pred.entryPrice,
					});
				}
			}
			return null;
		}

		// 2. Handle Price Updates
		if (context.topic === "binance-aggtrade-source") {
			const trade = data as AggTradeEvent;
			const now = trade.timestamp;

			// Update all active windows that encompass this time?
			// Actually strictly speaking, a window is 15m fixed: [Start, Start+15m)

			const finishedWindows: number[] = [];
			const outcomes: SmartMoneyOutcome[] = [];

			for (const [start, window] of this.activeWindows.entries()) {
				const end = start + this.WINDOW_DURATION;

				// If trade is within window
				if (now >= start && now < end) {
					const tracker = window.predictions.get(trade.symbol);
					if (tracker) {
						tracker.closePrice = trade.price;
						tracker.maxPrice = Math.max(tracker.maxPrice, trade.price);
						tracker.minPrice = Math.min(tracker.minPrice, trade.price);
					}
				}
				// If window is finished (with 1s buffer)
				else if (now >= end + 1000) {
					// Window closed. Finalize.
					finishedWindows.push(start);

					for (const [symbol, tracker] of window.predictions.entries()) {
						// Calculate PnL
						// If UP: (Close - Entry) / Entry
						// If DOWN: (Entry - Close) / Entry
						let pnl = 0;
						const entry = tracker.prediction.entryPrice;
						const close = tracker.closePrice;

						if (tracker.prediction.direction === "UP") {
							pnl = (close - entry) / entry;
						} else if (tracker.prediction.direction === "DOWN") {
							pnl = (entry - close) / entry;
						}

						// Simple Win/Loss based on positive PnL
						const isWin = pnl > 0;

						outcomes.push({
							symbol: symbol,
							windowStart: start,
							phase: tracker.prediction.phase,
							direction: tracker.prediction.direction,
							predictedAt: tracker.prediction.predictedAt,
							entryPrice: entry,
							closePrice: close,
							maxPrice: tracker.maxPrice,
							minPrice: tracker.minPrice,
							pnlPercent: pnl * 100,
							isWin,
							score: tracker.prediction.score,
							confidence: tracker.prediction.confidence,
						});
					}
				}
			}

			// Cleanup finished windows
			for (const w of finishedWindows) {
				this.activeWindows.delete(w);
			}

			if (outcomes.length > 0) {
				logger.info(
					{ count: outcomes.length },
					"Evaluated Smart Money predictions",
				);
				return {
					windowStart: outcomes[0].windowStart,
					outcomes,
				};
			}
		}

		return null;
	}
}
