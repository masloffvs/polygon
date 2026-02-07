import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

interface BlueSkyFeedConfig extends SourceConfig {
	intervalMs?: number;
	trendsUrl?: string; // Use trends to discover feeds
}

interface BlueSkyTrendingConfig extends SourceConfig {
	intervalMs?: number;
	trendsUrl?: string;
}

const DEFAULT_TRENDS_URL =
	"https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit=25";
const DEFAULT_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Curated list of high-quality feeds to always include
const CURATED_FEEDS = [
	"at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot", // What's Hot
	"at://did:plc:wqowuobffl66jv3kpsvo7ak4/app.bsky.feed.generator/the-algorithm", // The Algorithm
];

// Cache for resolved DIDs (handle -> DID)
const didCache = new Map<string, string>();

async function resolveHandleToDid(handle: string): Promise<string | null> {
	// Check cache first
	if (didCache.has(handle)) {
		return didCache.get(handle)!;
	}

	try {
		const response = await fetch(
			`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
		);
		if (!response.ok) return null;
		const data = await response.json();
		if (data.did) {
			didCache.set(handle, data.did);
			return data.did;
		}
		return null;
	} catch {
		return null;
	}
}

// ------------------------------------------------------------------
// Feed Source
// ------------------------------------------------------------------

export class BlueSkyFeedSource extends BaseSource {
	private interval: Timer | null = null;
	private readonly trendsUrl: string;
	private readonly intervalMs: number;

	constructor(
		config: Omit<BlueSkyFeedConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "bluesky-feed-source",
				name: "BlueSky Feed",
				description: "Monitors active BlueSky feed generators based on trends",
				...config,
			},
			aggregator,
		);
		this.trendsUrl = (config as any).trendsUrl || DEFAULT_TRENDS_URL;
		this.intervalMs = (config as any).intervalMs || DEFAULT_INTERVAL;
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting BlueSky Feed polling...");
		await this.poll();
		this.interval = setInterval(() => this.poll(), this.intervalMs);
	}

	public disconnect(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	private async poll() {
		try {
			const feedUris = await this.getTrendBasedFeeds();
			if (feedUris.length === 0) {
				logger.warn({ source: this.id }, "No feeds found in trends");
				return;
			}

			logger.info(
				{ source: this.id, count: feedUris.length },
				"Polling trending feeds",
			);

			// Process feeds parallel
			const promises = feedUris.map((uri) => this.fetchFeed(uri));
			await Promise.allSettled(promises);
		} catch (err) {
			logger.error({ source: this.id, err }, "Polling cycle failed");
		}
	}

	private async getTrendBasedFeeds(): Promise<string[]> {
		try {
			const response = await fetch(this.trendsUrl);
			if (!response.ok) {
				throw new Error(`Trends API error: ${response.statusText}`);
			}
			const data = await response.json();

			// Use both "topics" (trending) and "suggested" feeds
			const topics = data.topics || [];
			const suggested = data.suggested || [];
			const allTopics = [...topics, ...suggested];

			// Parse and resolve handles to DIDs
			const uriPromises = allTopics.map(async (t: any) => {
				if (!t.link) return null;

				// Parse link: "/profile/<identifier>/feed/<rkey>"
				const match = t.link.match(/profile\/([^/]+)\/feed\/([^/]+)/);
				if (!match) return null;

				const [_, identifier, rkey] = match;

				// If identifier is already a DID, use it directly
				if (identifier.startsWith("did:")) {
					return `at://${identifier}/app.bsky.feed.generator/${rkey}`;
				}

				// Otherwise resolve handle to DID
				const did = await resolveHandleToDid(identifier);
				if (!did) return null;

				return `at://${did}/app.bsky.feed.generator/${rkey}`;
			});

			const resolvedUris = await Promise.all(uriPromises);
			const validUris = resolvedUris.filter((u): u is string => u !== null);

			// Add curated feeds
			const allFeeds = [...CURATED_FEEDS, ...validUris];

			// Deduplicate
			return [...new Set(allFeeds)] as string[];
		} catch (err) {
			logger.error(
				{ source: this.id, err: (err as any).message },
				"Failed to discover feeds from trends",
			);
			// Return curated feeds as fallback
			return CURATED_FEEDS;
		}
	}

	private async fetchFeed(uri: string) {
		try {
			const url = `https://api.bsky.app/xrpc/app.bsky.feed.getFeed?feed=${encodeURIComponent(
				uri,
			)}&limit=25&lang=en`;

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(
					`Feed API error for ${uri}: ${response.status} ${response.statusText}`,
				);
			}
			const data = await response.json();

			if (data.feed && Array.isArray(data.feed)) {
				this.emit({
					type: "feed",
					feed: data.feed,
					uri: uri, // attach feed URI to event so we know source
					timestamp: Date.now(),
				});
			}
		} catch (err) {
			// Log warning but don't crash, some feeds might fail
			logger.warn(
				{ source: this.id, uri, err: (err as any).message },
				"Failed to fetch individual BlueSky feed",
			);
		}
	}
}

// ------------------------------------------------------------------
// Trending Source
// ------------------------------------------------------------------

export class BlueSkyTrendingSource extends BaseSource {
	private interval: Timer | null = null;
	private readonly trendsUrl: string;
	private readonly intervalMs: number;

	constructor(
		config: Omit<BlueSkyTrendingConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "bluesky-trending-source",
				name: "BlueSky Trends",
				description: "Monitors BlueSky trending topics",
				...config,
			},
			aggregator,
		);
		this.trendsUrl = (config as any).trendsUrl || DEFAULT_TRENDS_URL;
		this.intervalMs = (config as any).intervalMs || DEFAULT_INTERVAL;
	}

	public async connect(): Promise<void> {
		logger.info({ source: this.id }, "Starting BlueSky Trends polling...");
		await this.fetchTrends();
		this.interval = setInterval(() => this.fetchTrends(), this.intervalMs);
	}

	public disconnect(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	private async fetchTrends() {
		try {
			const response = await fetch(this.trendsUrl);
			if (!response.ok) {
				throw new Error(`Trends API error: ${response.statusText}`);
			}
			const data = await response.json();

			this.emit({
				type: "trending",
				topics: data.topics || [],
				suggested: data.suggested || [],
				timestamp: Date.now(),
			});
		} catch (err) {
			logger.error({ source: this.id, err }, "Failed to fetch BlueSky trends");
		}
	}
}
