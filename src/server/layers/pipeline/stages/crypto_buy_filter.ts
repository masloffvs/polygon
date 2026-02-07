import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";
import type { CryptoLeaderTradeEvent } from "./crypto_leaders_cache";

// Crypto keywords to match in title/slug
const _TRACKED_CRYPTO = [
	"BTC",
	"ETH",
	"SOL",
	"XRP",
	"BITCOIN",
	"ETHEREUM",
	"SOLANA",
	"RIPPLE",
];

export interface CryptoBuyEvent extends CryptoLeaderTradeEvent {
	cryptoSymbol: string;
	estimatedUsd: number;
	priceToBeat: number | null; // Target price from market title (e.g., $89,177.24)
	userRank: number; // Whale rank (1 = top trader)
}

/**
 * Stage that filters crypto leader trades for "buy" positions on major cryptos.
 *
 * We filter for:
 * 1. Side = BUY
 * 2. Title/Slug contains BTC/ETH/SOL/XRP
 */
export class CryptoBuyFilterStage extends PipelineStage<
	CryptoLeaderTradeEvent,
	CryptoBuyEvent
> {
	id = "crypto-buy-filter";
	description = "Filters for crypto buy positions (BTC, ETH, SOL, XRP)";
	inputs = ["crypto-leader-trades"];
	output = "crypto-leader-buys";

	public async process(
		data: CryptoLeaderTradeEvent,
		context: ProcessingContext,
	): Promise<CryptoBuyEvent | null> {
		if (context.topic !== "crypto-leader-trades") return null;

		// 1. Filter for BUY side
		if (data.side !== "BUY") {
			return null;
		}

		// 2. Identify Crypto Asset
		const text = `${data.title} ${data.slug}`.toUpperCase();
		let cryptoSymbol: string | null = null;

		if (text.includes("BTC") || text.includes("BITCOIN")) cryptoSymbol = "BTC";
		else if (text.includes("ETH") || text.includes("ETHEREUM"))
			cryptoSymbol = "ETH";
		else if (text.includes("SOL") || text.includes("SOLANA"))
			cryptoSymbol = "SOL";
		else if (text.includes("XRP") || text.includes("RIPPLE"))
			cryptoSymbol = "XRP";

		if (!cryptoSymbol) {
			return null;
		}

		// 3. Strict Outcome Filtering & Normalization
		// User rule: "Direction must be UP or DOWN. No Yes/No."
		// We normalize "Yes/No" based on Title keywords.
		let normalizedOutcome = data.outcome;
		const titleLower = data.title.toLowerCase();

		const hasUp = titleLower.includes("up");
		const hasDown = titleLower.includes("down");

		// Title Must contain Up or Down
		if (!hasUp && !hasDown) {
			return null;
		}

		// Map Yes/No to UP/DOWN
		if (normalizedOutcome === "Yes") {
			if (hasUp) normalizedOutcome = "UP";
			else if (hasDown) normalizedOutcome = "DOWN";
		} else if (normalizedOutcome === "No") {
			if (hasUp) normalizedOutcome = "DOWN";
			else if (hasDown) normalizedOutcome = "UP";
		}

		// 4. Estimate USD Value
		// Polymarket price is 0-1 (probability). value = size * price.
		// This represents the cost basis of the trade.
		const estimatedUsd = data.size * data.price;

		// 5. Parse "Price to Beat" from title
		// Examples: "BTC above $89,177.24", "Bitcoin to hit $100,000", "ETH below $3,500"
		const priceToBeat = this.parsePriceToBeat(data.title);

		// 6. Get user rank from leader info
		const userRank = Number(data.leaderInfo.rank) || 100;

		logger.debug(
			{
				wallet: data.proxyWallet,
				userName: data.leaderInfo.userName,
				crypto: cryptoSymbol,
				size: data.size,
				price: data.price,
				estimatedUsd,
				priceToBeat,
				userRank,
			},
			"Crypto leader buy detected",
		);

		return {
			...data,
			outcome: normalizedOutcome,
			cryptoSymbol,
			estimatedUsd,
			priceToBeat,
			userRank,
		};
	}

	/**
	 * Parse target price from market title
	 * Examples:
	 * - "BTC above $89,177.24 on January 31?" -> 89177.24
	 * - "Bitcoin to hit $100,000" -> 100000
	 * - "ETH below $3,500" -> 3500
	 * - "Will SOL reach $250?" -> 250
	 */
	private parsePriceToBeat(title: string): number | null {
		// Match price patterns: $XX,XXX.XX or $XX,XXX or $XXXXX
		const priceRegex = /\$[\d,]+(?:\.\d+)?/g;
		const matches = title.match(priceRegex);

		if (!matches || matches.length === 0) return null;

		// Take the first price found (usually the target)
		const priceStr = matches[0].replace(/[$,]/g, "");
		const price = parseFloat(priceStr);

		return Number.isNaN(price) ? null : price;
	}
}
