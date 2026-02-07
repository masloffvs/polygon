// src/server/layers/sources/whale_positions.ts
import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import type { SourceConfig } from "./base";
import { BaseSource } from "./base";

export interface WhalePosition {
  user: string;
  username: string;
  profileImage: string;
  category: string;
  asset: string;
  title: string;
  outcome: string;
  side: "BUY" | "SELL";
  size: number;
  avgPrice: number;
  currentPrice: number;
  valueUsd: number;
  pnl: number;
  pnlPercent: number;
  timestamp: number;
}

export interface WhalePositionsBatch {
  type: "whale_positions_batch";
  positions: WhalePosition[];
  fetchedAt: number;
}

interface WhalePositionsSourceConfig extends SourceConfig {
  /** Polling interval in milliseconds, default 5 minutes */
  intervalMs?: number;
  /** Minimum position value in USD to track, default 300000 */
  minValueUsd?: number;
  /** How many leaders to fetch per category, default 100 */
  limit?: number;
  /** Categories to track */
  categories?: string[];
}

// Polymarket leaderboard categories
const DEFAULT_CATEGORIES = [
  "crypto",
  "sports",
  "politics",
  "pop-culture",
  "business",
  "science",
];

export class WhalePositionsSource extends BaseSource {
  private intervalMs: number;
  private minValueUsd: number;
  private limit: number;
  private categories: string[];
  private timer: Timer | null = null;

  // Track known positions to detect new ones
  private knownPositions = new Map<string, WhalePosition>();

  private readonly baseUrl = "https://data-api.polymarket.com/v1/leaderboard";

  constructor(
    config: Omit<WhalePositionsSourceConfig, "id" | "name" | "description"> &
      Partial<SourceConfig>,
    aggregator: AggregatorLayer,
  ) {
    super(
      {
        id: "whale-positions-source",
        name: "Whale Positions Tracker",
        description:
          "Tracks large positions (>$300K) from top traders across all categories",
        ...config,
      },
      aggregator,
    );
    this.intervalMs = config.intervalMs ?? 5 * 60 * 1000; // 5 minutes default
    this.minValueUsd = config.minValueUsd ?? 300000; // $300K minimum
    this.limit = config.limit ?? 100;
    this.categories = config.categories ?? DEFAULT_CATEGORIES;
  }

  private buildUrl(category: string): string {
    return `${this.baseUrl}?timePeriod=day&orderBy=PNL&limit=${this.limit}&offset=0&category=${category}`;
  }

  public async connect(): Promise<void> {
    logger.info(
      {
        source: this.id,
        interval: this.intervalMs,
        minValueUsd: this.minValueUsd,
        categories: this.categories,
      },
      "Starting Whale Positions tracking...",
    );

    // Initial fetch
    await this.poll();

    // Start polling
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  private async poll(): Promise<void> {
    const allPositions: WhalePosition[] = [];

    for (const category of this.categories) {
      try {
        const positions = await this.fetchCategoryPositions(category);
        allPositions.push(...positions);
      } catch (err) {
        logger.error(
          { source: this.id, category, err },
          "Failed to fetch category positions",
        );
      }
    }

    if (allPositions.length === 0) {
      return;
    }

    // Find new large positions
    const newPositions: WhalePosition[] = [];
    const now = Date.now();

    for (const pos of allPositions) {
      const key = `${pos.user}-${pos.asset}-${pos.outcome}`;
      const existing = this.knownPositions.get(key);

      // New position or significantly increased (>20% bigger)
      if (!existing || pos.valueUsd > existing.valueUsd * 1.2) {
        newPositions.push(pos);
        this.knownPositions.set(key, pos);
      }
    }

    // Clean up old positions (older than 24h)
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    for (const [key, pos] of this.knownPositions.entries()) {
      if (pos.timestamp < oneDayAgo) {
        this.knownPositions.delete(key);
      }
    }

    if (newPositions.length > 0) {
      const batch: WhalePositionsBatch = {
        type: "whale_positions_batch",
        positions: newPositions,
        fetchedAt: now,
      };

      this.emit(batch);

      logger.info(
        {
          source: this.id,
          newPositions: newPositions.length,
          totalTracked: this.knownPositions.size,
        },
        "Detected new whale positions",
      );
    }
  }

  private async fetchCategoryPositions(
    category: string,
  ): Promise<WhalePosition[]> {
    const url = this.buildUrl(category);

    logger.debug({ source: this.id, category, url }, "Fetching leaderboard...");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PolygonBot/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const leaders = await response.json();

    if (!Array.isArray(leaders)) {
      return [];
    }

    const positions: WhalePosition[] = [];
    const now = Date.now();

    for (const leader of leaders) {
      // Each leader has positions array
      const userPositions = leader.positions || [];

      for (const pos of userPositions) {
        const valueUsd = Math.abs(Number(pos.value) || 0);

        // Filter by minimum value
        if (valueUsd < this.minValueUsd) {
          continue;
        }

        const currentPrice = Number(pos.curPrice) || 0;
        const avgPrice = Number(pos.avgPrice) || 0;
        const size = Number(pos.size) || 0;
        const pnl = Number(pos.pnl) || 0;
        const pnlPercent =
          avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;

        positions.push({
          user: leader.userAddress || leader.address || "",
          username: leader.username || leader.name || "Anonymous",
          profileImage: leader.profileImage || "",
          category,
          asset: pos.asset || pos.tokenId || "",
          title: pos.title || pos.question || "",
          outcome: pos.outcome || "",
          side: pos.side === "SELL" ? "SELL" : "BUY",
          size,
          avgPrice,
          currentPrice,
          valueUsd,
          pnl,
          pnlPercent,
          timestamp: now,
        });
      }
    }

    logger.debug(
      { source: this.id, category, largePositions: positions.length },
      "Found large positions",
    );

    return positions;
  }

  public disconnect(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.knownPositions.clear();
    logger.info({ source: this.id }, "Disconnected");
  }
}
