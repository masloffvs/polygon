import type { BinanceDepthEvent } from "../../../adapters/binance";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { AggregatedCryptoBuys } from "./crypto_buy_aggregation";
import type { CryptoBuyEvent } from "./crypto_buy_filter";

export interface TraderAvgPosition {
	user: string;
	userAddress: string;
	userRank: number; // Whale rank (1 = top trader)
	asset: string;
	outcome: string; // "Yes", "No", "UP", "DOWN"
	avgEntryPrice: number;
	priceToBeat: number | null; // Target price from market (e.g., $89,177.24)
	totalSize: number;
	tradeCount: number;
	lastTradeTimestamp: number;
}

export interface TraderPerformance {
	user: string;
	userAddress: string;
	userRank: number; // Whale rank (1 = top trader)
	asset: string;
	outcome: string;
	avgEntryPrice: number;
	priceToBeat: number | null; // Target price from market
	currentSpotPrice: number;
	priceChangePercent: number; // The market move since entry
	distanceToBeat: number | null; // % distance from priceToBeat (positive = price > target)
	isProfitable: boolean; // Based on Outcome vs Price Direction relative to priceToBeat
	totalSize: number;
	lastUpdate: number;
}

export interface ProfitabilitySnapshot {
	windowStart: number;
	windowEnd: number;
	performances: TraderPerformance[];
}

/**
 * Stage that tracks trader avg entries against real-time global spot prices (Binance).
 * Calculates if their "prediction" (Up/Down) is currently executing correctly.
 */
export class CryptoProfitabilityStage extends PipelineStage<
	CryptoBuyEvent | BinanceDepthEvent | AggregatedCryptoBuys,
	ProfitabilitySnapshot
> {
	id = "crypto-profitability";
	description = "Calculates trader performance against real-time spot prices";
	// Inputs:
	// - crypto-leader-buys: New trades to track
	// - binance-source: Real-time price updates
	inputs = ["crypto-leader-buys", "binance-source"];
	output = "crypto-profitability-update";

	// State
	private currentPrices = new Map<string, number>(); // BTC -> 50000
	// Key: userAddress-asset-outcome
	private activePositions = new Map<string, TraderAvgPosition>();

	// Window tracking (15m aligned)
	private currentWindowStart = 0;
	private readonly WINDOW_MS = 15 * 60 * 1000;

	private lastEmitTime = 0;

	constructor() {
		super();
		this.updateWindowBounds();
	}

	private updateWindowBounds() {
		const now = Date.now();
		this.currentWindowStart = Math.floor(now / this.WINDOW_MS) * this.WINDOW_MS;
	}

	public async process(
		data: CryptoBuyEvent | BinanceDepthEvent,
		context: ProcessingContext,
	): Promise<ProfitabilitySnapshot | null> {
		const now = Date.now();

		// 1. Handle Price Updates (Binance)
		if (context.topic === "binance-source") {
			const event = data as BinanceDepthEvent;
			// Extract Symbol and Price
			// stream name: btcusdt@depth20
			const stream = event?.stream;
			const eventData = event?.data;
			if (!stream || !eventData) return null;

			const symbol = stream.split("@")[0].toUpperCase().replace("USDT", "");

			const bids = eventData.bids;
			const asks = eventData.asks;

			if (bids && asks && bids.length > 0 && asks.length > 0) {
				const bestBid = parseFloat(bids[0][0]);
				const bestAsk = parseFloat(asks[0][0]);
				const midPrice = (bestBid + bestAsk) / 2;

				this.currentPrices.set(symbol, midPrice);

				// Throttle updates: Emit stats max once per 2 seconds
				if (now - this.lastEmitTime > 2000) {
					this.lastEmitTime = now;
					return this.generateSnapshot();
				}
			}
			return null;
		}

		// 2. Handle New Trades (Leader Buys)
		if (context.topic === "crypto-leader-buys") {
			const trade = data as CryptoBuyEvent;
			const spotPrice = this.currentPrices.get(trade.cryptoSymbol);

			// If we don't have a price yet, we can't benchmark entry.
			// Record it with 0 or skip? Better to skip strictly to ensure accurate data.
			if (spotPrice) {
				this.checkWindowRotation();

				// Key by User + Asset + Outcome (Long BTC vs Short BTC should be separate?)
				const key = `${trade.leaderInfo.proxyWallet}-${trade.cryptoSymbol}-${
					trade.outcome
				}`;

				let pos = this.activePositions.get(key);
				if (!pos) {
					pos = {
						user:
							trade.leaderInfo.userName ||
							trade.leaderInfo.xUsername ||
							(trade.leaderInfo.proxyWallet
								? trade.leaderInfo.proxyWallet.slice(0, 8)
								: "Unknown"),
						userAddress: trade.leaderInfo.proxyWallet,
						userRank: trade.userRank, // Store whale rank
						asset: trade.cryptoSymbol,
						outcome: trade.outcome || "Unknown",
						avgEntryPrice: 0,
						priceToBeat: trade.priceToBeat, // Store target price
						totalSize: 0,
						tradeCount: 0,
						lastTradeTimestamp: 0,
					};
					this.activePositions.set(key, pos);
				}

				// Update Average Entry Price
				// New Avg = ((OldAvg * OldSize) + (NewPrice * NewSize)) / (OldSize + NewSize)
				const totalValue =
					pos.avgEntryPrice * pos.totalSize + spotPrice * trade.size;
				const newTotalSize = pos.totalSize + trade.size;

				pos.avgEntryPrice = totalValue / newTotalSize;
				pos.totalSize = newTotalSize;
				pos.tradeCount += 1;
				pos.lastTradeTimestamp = trade.timestamp;

				// Update priceToBeat if we get a new one (later trades might have updated market)
				if (trade.priceToBeat !== null) {
					pos.priceToBeat = trade.priceToBeat;
				}
			} else {
				// Log skip?
				// logger.debug({ asset: trade.cryptoSymbol }, "Skipping buy, no spot price yet");
			}
			return null;
		}

		return null;
	}

	private checkWindowRotation() {
		const now = Date.now();
		const newWindowStart = Math.floor(now / this.WINDOW_MS) * this.WINDOW_MS;

		if (newWindowStart > this.currentWindowStart) {
			// Rotate window: Clear positions for the new window
			this.activePositions.clear();
			this.currentWindowStart = newWindowStart;
			logger.info(
				{ window: newWindowStart },
				"Rotated Crypto Profitability Window",
			);
		}
	}

	private generateSnapshot(): ProfitabilitySnapshot {
		const performances: TraderPerformance[] = [];

		for (const pos of this.activePositions.values()) {
			const currentPrice = this.currentPrices.get(pos.asset);
			if (!currentPrice) continue;

			const priceDeltaPercent =
				((currentPrice - pos.avgEntryPrice) / pos.avgEntryPrice) * 100;

			// Calculate distance to priceToBeat (target price from market)
			// Positive = price is ABOVE target, Negative = price is BELOW target
			let distanceToBeat: number | null = null;
			if (pos.priceToBeat !== null && pos.priceToBeat > 0) {
				distanceToBeat =
					((currentPrice - pos.priceToBeat) / pos.priceToBeat) * 100;
			}

			let isProfitable = false;
			const outcomeUpper = pos.outcome.toUpperCase();

			// NEW LOGIC: Use priceToBeat for profitability if available
			// UP/YES -> Profit if Price > priceToBeat (or entry if no target)
			// DOWN/NO -> Profit if Price < priceToBeat (or entry if no target)
			if (pos.priceToBeat !== null && pos.priceToBeat > 0) {
				// Use target price for profitability calculation
				if (outcomeUpper === "UP" || outcomeUpper === "YES") {
					isProfitable = currentPrice > pos.priceToBeat;
				} else if (outcomeUpper === "DOWN" || outcomeUpper === "NO") {
					isProfitable = currentPrice < pos.priceToBeat;
				}
			} else {
				// Fallback to entry price comparison
				if (outcomeUpper === "UP" || outcomeUpper === "YES") {
					isProfitable = priceDeltaPercent > 0;
				} else if (outcomeUpper === "DOWN" || outcomeUpper === "NO") {
					isProfitable = priceDeltaPercent < 0;
				}
			}

			performances.push({
				user: pos.user,
				userAddress: pos.userAddress,
				userRank: pos.userRank,
				asset: pos.asset,
				outcome: pos.outcome,
				avgEntryPrice: pos.avgEntryPrice,
				priceToBeat: pos.priceToBeat,
				currentSpotPrice: currentPrice,
				priceChangePercent: priceDeltaPercent,
				distanceToBeat,
				isProfitable,
				totalSize: pos.totalSize,
				lastUpdate: Date.now(),
			});
		}

		return {
			windowStart: this.currentWindowStart,
			windowEnd: this.currentWindowStart + this.WINDOW_MS,
			performances,
		};
	}
}
