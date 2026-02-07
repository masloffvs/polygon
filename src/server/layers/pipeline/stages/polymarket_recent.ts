import type { RealtimeEvent } from "../../../integrations/polymarket/realtime-client";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface ActivityItem {
	transactionHash: string;
	timestamp: string; // ISO String for frontend
	side: "BUY" | "SELL";
	asset: string;
	title: string;
	size: number;
	price: number;
	usdcValue: number;
	proxyWallet: string;
	outcome: string;
	eventSlug: string;
}

export class PolymarketRecentStage extends PipelineStage<
	RealtimeEvent,
	ActivityItem[]
> {
	id = "polymarket-recent-history";
	description = "Maintains a snapshot of the last 300 Polymarket trades";
	inputs = ["polyscan-ws-source"];
	output = "polymarket-recent-snapshot";

	private history: ActivityItem[] = [];
	private lastEmit = 0;
	private readonly THROTTLE_MS = 250; // Update frontend 4 times a second max

	public async process(
		data: RealtimeEvent,
		context: ProcessingContext,
	): Promise<ActivityItem[] | null> {
		if (context.topic !== "polyscan-ws-source") return null;
		if (data.type !== "trade" && data.type !== "whale") return null;

		const trade = data.whaleTrade || data.trade;
		if (!trade) return null;

		const item: ActivityItem = {
			transactionHash: trade.transactionHash,
			// Convert unix timestamp (seconds) to ISO string
			timestamp: new Date(trade.timestamp * 1000).toISOString(),
			side: trade.side,
			asset: trade.asset,
			title: trade.title,
			size: trade.size,
			price: trade.price,
			usdcValue: trade.size * trade.price,
			proxyWallet: trade.proxyWallet,
			outcome: trade.outcome,
			eventSlug: trade.eventSlug,
		};

		// Deduplicate: Remove existing item with same hash if present (to bump to top) or just skip?
		// Usually updates to same trade don't happen, it's a new trade.
		// If hash exists, it's likely the duplicate 'whale' event for the same 'trade'.

		const existingIdx = this.history.findIndex(
			(x) => x.transactionHash === item.transactionHash,
		);
		if (existingIdx !== -1) {
			// If it exists, remove it so we can re-add it at the top (if we want to bump)
			// OR just ignore it. Duplicate events usually mean same data.
			// Let's ignore it to avoid UI jitter.
			return null;
		}

		// Prepend and trim
		this.history.unshift(item);
		if (this.history.length > 300) {
			this.history = this.history.slice(0, 300);
		}

		// Throttle emission
		const now = Date.now();
		if (now - this.lastEmit >= this.THROTTLE_MS) {
			this.lastEmit = now;
			return this.history;
		}

		return null;
	}
}
