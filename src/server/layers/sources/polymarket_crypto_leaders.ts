import type { CryptoLeadersBatch } from "../../adapters/polymarket_crypto_leaders";
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

interface PolymarketCryptoLeadersConfig extends SourceConfig {
  /** Polling interval in milliseconds, default 1 hour */
  intervalMs?: number;
  /** How many leaders to fetch, default 50 */
  limit?: number;
}

export class PolymarketCryptoLeadersSource extends BaseSource {
  private intervalMs: number;
  private limit: number;
  private timer: Timer | null = null;

  private readonly baseUrl = "https://data-api.polymarket.com/v1/leaderboard";

  constructor(
    config: Omit<PolymarketCryptoLeadersConfig, "id" | "name" | "description"> &
      Partial<SourceConfig>,
    aggregator: AggregatorLayer,
  ) {
    super(
      {
        id: "polymarket-crypto-leaders-source",
        name: "Polymarket Crypto Leaders",
        description: "Top crypto traders from Polymarket leaderboard",
        ...config,
      },
      aggregator,
    );
    this.intervalMs = config.intervalMs ?? 60 * 60 * 1000; // 1 hour default
    this.limit = config.limit ?? 50;
  }

  private buildUrl(): string {
    return `${this.baseUrl}?timePeriod=day&orderBy=PNL&limit=${this.limit}&offset=0&category=crypto`;
  }

  public async connect(): Promise<void> {
    logger.info(
      {
        source: this.id,
        interval: this.intervalMs,
        limit: this.limit,
      },
      "Starting Polymarket Crypto Leaders polling...",
    );

    // Initial fetch
    await this.poll();

    // Start polling
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  private async poll(): Promise<void> {
    const url = this.buildUrl();

    try {
      logger.debug({ source: this.id, url }, "Fetching crypto leaders...");

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PolygonBot/1.0)",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const batch: CryptoLeadersBatch = {
        type: "crypto_leaders_batch",
        leaders: data,
        fetchedAt: Date.now(),
      };

      this.emit(batch);

      logger.info(
        { source: this.id, count: data.length },
        "Fetched crypto leaders",
      );
    } catch (err) {
      logger.error({ source: this.id, err }, "Failed to fetch crypto leaders");
    }
  }

  public disconnect(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info({ source: this.id }, "Disconnected");
  }
}
