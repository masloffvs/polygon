import { clickhouse } from "@/storage/clickhouse";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { CryptoBuyEvent } from "./crypto_buy_filter";

// 15 minutes in milliseconds
const WINDOW_MS = 15 * 60 * 1000;

interface WindowBucket {
	windowStart: number;
	windowEnd: number;
	buys: Map<string, CryptoAggregation>; // crypto symbol -> aggregation
	seenTxHashes: Set<string>; // Deduplication set
}

interface CryptoAggregation {
	symbol: string;
	count: number;
	totalAmount: number;
	totalUsd: number;
	uniqueWallets: Set<string>;
	events: CryptoBuyEvent[];
}

export interface AggregatedTrade {
	user: string;
	userAddress: string;
	userRank: number;
	asset: string; // BTC, ETH, etc.
	amount: number;
	price: number;
	usdValue: number;
	timestamp: number;
	slug: string;
	title: string;
	outcome: string;
}

export interface AggregatedCryptoBuys {
	windowStart: Date;
	windowEnd: Date;
	aggregations: {
		symbol: string;
		buyCount: number;
		totalAmount: number;
		totalUsd: number;
		uniqueTraders: number;
		avgBuySize: number;
	}[];
	recentTrades: AggregatedTrade[];
	totalBuys: number;
	totalUsd: number;
}

/**
 * Stage that aggregates crypto buy events into 15-minute windows
 * and stores them in ClickHouse for charting.
 */
export class CryptoBuyAggregationStage extends PipelineStage<
	CryptoBuyEvent,
	AggregatedCryptoBuys
> {
	id = "crypto-buy-aggregation";
	description =
		"Aggregates crypto buys into 15min windows and stores to ClickHouse";
	inputs = ["crypto-leader-buys"];
	output = "crypto-buy-aggregated";

	// Current active window
	private currentWindow: WindowBucket | null = null;
	private flushTimer: Timer | null = null;

	constructor() {
		super();
		// Start the flush timer
		this.startFlushTimer();
	}

	private startFlushTimer(): void {
		// Check every minute if we need to flush
		this.flushTimer = setInterval(() => {
			this.checkAndFlush();
		}, 60 * 1000);
	}

	private getWindowStart(timestamp: number): number {
		// Round down to nearest 15 minute boundary
		return Math.floor(timestamp / WINDOW_MS) * WINDOW_MS;
	}

	private async checkAndFlush(): Promise<void> {
		if (!this.currentWindow) return;

		const now = Date.now();
		const currentWindowStart = this.getWindowStart(now);

		// If we've moved to a new window, flush the old one
		if (currentWindowStart > this.currentWindow.windowStart) {
			await this.flushWindow(this.currentWindow);
			this.currentWindow = null;
		}
	}

	private async flushWindow(window: WindowBucket): Promise<void> {
		if (window.buys.size === 0) return;

		const rows: any[] = [];

		for (const [symbol, agg] of window.buys) {
			rows.push({
				window_start: new Date(window.windowStart)
					.toISOString()
					.replace("T", " ")
					.slice(0, 19),
				window_end: new Date(window.windowEnd)
					.toISOString()
					.replace("T", " ")
					.slice(0, 19),
				symbol: symbol,
				buy_count: agg.count,
				total_amount: agg.totalAmount,
				total_usd: agg.totalUsd,
				unique_traders: agg.uniqueWallets.size,
				avg_buy_size: agg.count > 0 ? agg.totalUsd / agg.count : 0,
			});
		}

		try {
			await clickhouse.insert({
				table: "crypto_leaders_buys_15m",
				values: rows,
				format: "JSONEachRow",
			});

			logger.info(
				{
					windowStart: new Date(window.windowStart).toISOString(),
					symbols: rows.length,
					totalBuys: rows.reduce((sum, r) => sum + r.buy_count, 0),
				},
				"Flushed crypto buy aggregation to ClickHouse",
			);
		} catch (err) {
			logger.error({ err }, "Failed to flush crypto buy aggregation");
		}
	}

	private getRecentTrades(window: WindowBucket): AggregatedTrade[] {
		const allEvents: CryptoBuyEvent[] = [];
		for (const agg of window.buys.values()) {
			allEvents.push(...agg.events);
		}
		return allEvents
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, 50)
			.map((e) => ({
				user:
					e.leaderInfo.userName ||
					e.leaderInfo.xUsername ||
					(e.leaderInfo.proxyWallet
						? e.leaderInfo.proxyWallet.slice(0, 8)
						: "Unknown"),
				userAddress: e.leaderInfo.proxyWallet,
				userRank: Number(e.leaderInfo.rank),
				asset: e.cryptoSymbol,
				amount: e.size,
				price: e.price,
				usdValue: e.estimatedUsd,
				timestamp: e.timestamp,
				slug: e.slug,
				title: e.title,
				outcome: e.outcome,
			}));
	}

	public async process(
		data: CryptoBuyEvent,
		context: ProcessingContext,
	): Promise<AggregatedCryptoBuys | null> {
		if (context.topic !== "crypto-leader-buys") return null;

		const now = Date.now();
		const windowStart = this.getWindowStart(now);
		const windowEnd = windowStart + WINDOW_MS;

		// Initialize or rotate window
		if (!this.currentWindow || this.currentWindow.windowStart !== windowStart) {
			// Flush previous window if exists
			if (this.currentWindow) {
				await this.flushWindow(this.currentWindow);
			}

			this.currentWindow = {
				windowStart,
				windowEnd,
				buys: new Map(),
				seenTxHashes: new Set(),
			};
		}

		// Deduplication check
		// Some events might have identical transaction hash if they are part of same batch,
		// but usually user wants to see unique blockchain transactions or unique orders.
		// If trade has no hash (e.g. some internal fills), we skip dedup or use other ID.
		if (
			data.transactionHash &&
			this.currentWindow.seenTxHashes.has(data.transactionHash)
		) {
			return null;
		}

		if (data.transactionHash) {
			this.currentWindow.seenTxHashes.add(data.transactionHash);
		}

		// Get or create aggregation for this symbol
		const symbol = data.cryptoSymbol;
		if (!this.currentWindow.buys.has(symbol)) {
			this.currentWindow.buys.set(symbol, {
				symbol,
				count: 0,
				totalAmount: 0,
				totalUsd: 0,
				uniqueWallets: new Set(),
				events: [],
			});
		}

		const agg = this.currentWindow.buys.get(symbol)!;
		agg.count += 1;
		agg.totalAmount += data.size;
		agg.totalUsd += data.estimatedUsd;
		agg.uniqueWallets.add(data.leaderInfo.proxyWallet.toLowerCase());
		agg.events.push(data);

		// Build current snapshot for downstream consumers
		const aggregations = Array.from(this.currentWindow.buys.values()).map(
			(a) => ({
				symbol: a.symbol,
				buyCount: a.count,
				totalAmount: a.totalAmount,
				totalUsd: a.totalUsd,
				uniqueTraders: a.uniqueWallets.size,
				avgBuySize: a.count > 0 ? a.totalUsd / a.count : 0,
			}),
		);

		return {
			windowStart: new Date(this.currentWindow.windowStart),
			windowEnd: new Date(this.currentWindow.windowEnd),
			aggregations,
			recentTrades: this.getRecentTrades(this.currentWindow),
			totalBuys: aggregations.reduce((sum, a) => sum + a.buyCount, 0),
			totalUsd: aggregations.reduce((sum, a) => sum + a.totalUsd, 0),
		};
	}

	/**
	 * Force flush current window (for graceful shutdown)
	 */
	public async forceFlush(): Promise<void> {
		if (this.currentWindow) {
			await this.flushWindow(this.currentWindow);
			this.currentWindow = null;
		}
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
	}
}
