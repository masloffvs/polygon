import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface NewsApiConfig extends SourceConfig {
	/** Polling interval in milliseconds, default 15 minutes */
	intervalMs?: number;
	/** API Key(s) for newsapi.org. multiple keys separated by ; */
	apiKeys?: string;
	/** Search query */
	query?: string;
}

export class NewsApiSource extends BaseSource {
	private intervalMs: number;
	private apiKeys: string[];
	private currentKeyIndex = 0;
	private query: string;
	private timer: Timer | null = null;

	private readonly baseUrl = "https://newsapi.org/v2/everything";

	constructor(
		config: Omit<NewsApiConfig, "id" | "name" | "description"> &
			Partial<SourceConfig>,
		aggregator: AggregatorLayer,
	) {
		super(
			{
				id: "news-api-source",
				name: "General News Feed",
				description: "General News from NewsAPI (Multi-key support)",
				...config,
			},
			aggregator,
		);
		// Default 15 minutes: 15 * 60 * 1000 = 900000
		this.intervalMs = config.intervalMs ?? 900000;

		const keyString =
			config.apiKeys ||
			process.env.NEWS_API_KEYS ||
			"0f268d345b6f4840aa13e12cd32fb5b3";
		this.apiKeys = keyString
			.split(";")
			.map((k) => k.trim())
			.filter((k) => k.length > 0);

		this.query = config.query || "trump"; // Default per request
	}

	public async connect(): Promise<void> {
		logger.info(
			{
				source: this.id,
				interval: this.intervalMs,
				keysCount: this.apiKeys.length,
			},
			"Starting NewsAPI polling...",
		);

		// Initial fetch
		await this.poll();

		// Start polling
		this.timer = setInterval(() => this.poll(), this.intervalMs);
	}

	private getNextKey(): string {
		const key = this.apiKeys[this.currentKeyIndex] || "";
		// Rotate key for next request only if we encounter an error (handled in catch mainly,
		// but here we just return the current one. Round robin strategy could be used too)
		// Simple strategy: use one until it fails, then switch?
		// For now let's just use the current one.
		return key;
	}

	private rotateKey() {
		this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
		logger.warn(
			{ source: this.id, newIndex: this.currentKeyIndex },
			"Rotated API Key",
		);
	}

	private async poll(): Promise<void> {
		// Try multiple keys if one fails
		let attempts = 0;
		const maxAttempts = this.apiKeys.length;

		while (attempts < maxAttempts) {
			const apiKey = this.getNextKey();
			const url = `${this.baseUrl}?q=${encodeURIComponent(this.query)}&sortBy=publishedAt&language=en&apiKey=${apiKey}`;

			try {
				logger.debug({ source: this.id }, "Fetching NewsAPI data...");

				const response = await fetch(url, {
					headers: {
						Accept: "application/json",
						"User-Agent": "Mozilla/5.0 (compatible; PolygonBot/1.0)",
					},
				});

				if (response.status === 401 || response.status === 429) {
					// Unauthorized or Rate Limited
					logger.warn(
						{ source: this.id, status: response.status },
						"API Key failed, rotating...",
					);
					this.rotateKey();
					attempts++;
					continue; // Try next key
				}

				if (!response.ok) {
					throw new Error(`HTTP ${response.status} ${response.statusText}`);
				}

				const data = await response.json();

				if (data.status === "ok" && Array.isArray(data.articles)) {
					this.emit({
						type: "news_api_batch",
						articles: data.articles,
						fetchedAt: Date.now(),
					});

					logger.info(
						{ source: this.id, count: data.articles.length },
						"NewsAPI data fetched successfully",
					);
					return; // Success, exit loop
				} else {
					logger.warn(
						{ source: this.id, data },
						"NewsAPI returned unexpected format",
					);
					return; // Unsuccessful structure, but technically request worked. Don't retry keys.
				}
			} catch (err) {
				logger.error({ source: this.id, err }, "Failed to fetch NewsAPI data");
				// If network error, maybe don't rotate key? Or do.
				// For now, let's stop retrying to avoid spamming if network is down.
				break;
			}
		}
	}

	public disconnect(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}
}
