// We need to import the event types
import type { BinanceDepthEvent } from "../../../adapters/binance";
import type { BybitBookEvent } from "../../../adapters/bybit";
import type { OKXBookEvent } from "../../../adapters/okx";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface NormalizedOrderBook {
	source: string;
	symbol: string;
	bids: [number, number][]; // [price, size]
	asks: [number, number][]; // [price, size]
	timestamp: number;
}

// Helper to manage a local orderbook state
class LocalOrderBook {
	// Using Maps for Price -> Size (string for precision, but convert to number for sorting/usage here as per requirement)
	// For "Averaging" we probably want numbers. Zod schemas have strings.
	// We will store as Numbers for this stage to simplify.
	bids = new Map<number, number>();
	asks = new Map<number, number>();

	constructor(public symbol: string) {}

	public apply(
		bids: [string, string][],
		asks: [string, string][],
		isSnapshot: boolean,
	) {
		if (isSnapshot) {
			this.bids.clear();
			this.asks.clear();
		}

		// Apply updates
		for (const [p, s] of bids) {
			const price = parseFloat(p);
			const size = parseFloat(s);
			if (size === 0) this.bids.delete(price);
			else this.bids.set(price, size);
		}

		for (const [p, s] of asks) {
			const price = parseFloat(p);
			const size = parseFloat(s);
			if (size === 0) this.asks.delete(price);
			else this.asks.set(price, size);
		}
	}

	public getTop(n: number): {
		bids: [number, number][];
		asks: [number, number][];
	} {
		// Sort Bids Descending
		const sortedBids = Array.from(this.bids.entries())
			.sort((a, b) => b[0] - a[0])
			.slice(0, n);

		// Sort Asks Ascending
		const sortedAsks = Array.from(this.asks.entries())
			.sort((a, b) => a[0] - b[0])
			.slice(0, n);

		return { bids: sortedBids, asks: sortedAsks };
	}
}

export class OrderBookNormalizationStage extends PipelineStage<
	any,
	NormalizedOrderBook
> {
	id = "std-normalization";
	description =
		"Normalizes and maintains Full Order Book state from all sources";
	inputs = ["binance-source", "okx-source", "bybit-source"];
	output = "normalized-books";

	// State: Source -> Symbol -> Book
	private books = new Map<string, Map<string, LocalOrderBook>>();

	private getBook(source: string, symbol: string): LocalOrderBook {
		if (!this.books.has(source)) {
			this.books.set(source, new Map());
		}
		const sourceBooks = this.books.get(source)!;
		if (!sourceBooks.has(symbol)) {
			sourceBooks.set(symbol, new LocalOrderBook(symbol));
		}
		return sourceBooks.get(symbol)!;
	}

	public async process(
		data: any,
		context: ProcessingContext,
	): Promise<NormalizedOrderBook | null> {
		const source = context.topic;
		let symbol = "";
		let rawBids: [string, string][] = [];
		let rawAsks: [string, string][] = [];
		let isSnapshot = false;

		// Detect format based on Source ID
		// 1. Binance
		if (source === "binance-source") {
			const event = data as BinanceDepthEvent;
			// Binance "depth20" are strictly snapshots of the top 20
			// So we treat them as snapshots every time
			if (!event.data) return null;
			// Map "BNBBTC" to "BNB-BTC" or normalize?
			// Our other sources use "BTC-USDT". Binance uses "BTCUSDT".
			// Let's normalize to "BTC-USDT" for consistency if possible.
			// Easiest is to insert hyphen if missing and pairs are standard.
			const rawSym: string =
				(typeof event.data.s === "string" ? event.data.s : null) ??
				event.stream?.split("@")[0]?.toUpperCase() ??
				"";
			// Heuristic: If it ends in USDT
			symbol = this.normalizeSymbol(rawSym);

			rawBids = event.data.bids;
			rawAsks = event.data.asks;
			isSnapshot = true; // depth20 is a finite snapshot
		}
		// 2. OKX
		else if (source === "okx-source") {
			const event = data as OKXBookEvent;
			if (!event.data || event.data.length === 0) return null;
			const payload = event.data[0];
			if (!payload) return null;

			symbol = event.arg.instId; // Already formatted as BTC-USDT usually
			rawBids = payload.bids.map((b) => [b[0], b[1]]);
			rawAsks = payload.asks.map((a) => [a[0], a[1]]);
			isSnapshot = event.action === "snapshot";
		}
		// 3. Bybit
		else if (source === "bybit-source") {
			const event = data as BybitBookEvent;
			if (!event.data) return null;

			symbol = this.normalizeSymbol(event.data.s);
			rawBids = event.data.b;
			rawAsks = event.data.a;
			isSnapshot = event.type === "snapshot";
		} else {
			return null;
		}

		if (!symbol) return null;

		// Update Local State
		const book = this.getBook(source, symbol);
		book.apply(rawBids, rawAsks, isSnapshot);

		// Get Clean Snapshot
		const { bids, asks } = book.getTop(20);

		return {
			source,
			symbol,
			bids,
			asks,
			timestamp: Date.now(),
		};
	}

	private normalizeSymbol(s: string): string {
		// Basic Normalizer: BTCUSDT -> BTC-USDT
		if (!s.includes("-") && s.endsWith("USDT")) {
			return s.replace("USDT", "-USDT");
		}
		return s;
	}
}
