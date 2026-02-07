import type {
	CryptoLeader,
	CryptoLeadersBatch,
} from "../../../adapters/polymarket_crypto_leaders";
import type { RealtimeEvent } from "../../../integrations/polymarket/realtime-client";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface CryptoLeaderTradeEvent {
	leaderInfo: CryptoLeader;
	asset: string;
	side: "BUY" | "SELL";
	size: number;
	price: number;
	title: string;
	slug: string;
	timestamp: number;
	transactionHash: string;
	proxyWallet: string;
	outcome: string; // "Yes" or "No"
}

/**
 * Stage that caches crypto leaders from leaderboard and filters
 * polyscan-ws events by their proxyWallet addresses.
 *
 * Inputs:
 *   - polymarket-crypto-leaders-source: updates the cached leaderboard
 *   - polyscan-ws-source: trade events to filter
 *
 * Output: trades that involve a crypto leader wallet
 */
export class CryptoLeadersCacheStage extends PipelineStage<
	CryptoLeadersBatch | RealtimeEvent,
	CryptoLeaderTradeEvent
> {
	id = "crypto-leaders-cache";
	description = "Caches crypto leaders and filters trades by their wallets";
	inputs = ["polymarket-crypto-leaders-source", "polyscan-ws-source"];
	output = "crypto-leader-trades";

	// In-memory cache: proxyWallet (lowercase) -> CryptoLeader
	private leadersCache = new Map<string, CryptoLeader>();

	public async process(
		data: CryptoLeadersBatch | RealtimeEvent,
		context: ProcessingContext,
	): Promise<CryptoLeaderTradeEvent | null> {
		// Handle leaderboard update
		if (context.topic === "polymarket-crypto-leaders-source") {
			const batch = data as CryptoLeadersBatch;
			if (batch.type !== "crypto_leaders_batch") return null;

			// Clear and rebuild cache
			this.leadersCache.clear();
			for (const leader of batch.leaders) {
				const wallet = leader.proxyWallet.toLowerCase();
				this.leadersCache.set(wallet, leader);
			}

			logger.info(
				{ count: this.leadersCache.size },
				"Updated crypto leaders cache",
			);

			return null; // Don't emit anything for cache updates
		}

		// Handle polyscan realtime events
		if (context.topic === "polyscan-ws-source") {
			const event = data as RealtimeEvent;

			// We only care about trade/whale events
			if (event.type !== "trade" && event.type !== "whale") return null;

			const trade = event.trade || event.whaleTrade;
			if (!trade) return null;

			// Skip if cache is empty
			if (this.leadersCache.size === 0) {
				return null;
			}

			// Check if proxyWallet is a leader wallet
			const walletLower = trade.proxyWallet.toLowerCase();
			const leaderInfo = this.leadersCache.get(walletLower);

			if (!leaderInfo) {
				return null; // Not a leader wallet
			}

			// Emit enriched event
			return {
				leaderInfo,
				asset: trade.asset,
				side: trade.side,
				size: trade.size,
				price: trade.price,
				title: trade.title,
				slug: trade.slug,
				timestamp: trade.timestamp,
				transactionHash: trade.transactionHash,
				proxyWallet: trade.proxyWallet,
				outcome: trade.outcome,
			};
		}

		return null;
	}

	/**
	 * Get current cached leaders (for debugging/API)
	 */
	public getLeadersCache(): Map<string, CryptoLeader> {
		return this.leadersCache;
	}
}
