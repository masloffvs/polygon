import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

interface ParsedTweet {
  id: string;
  text: string;
  fullText: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    profileImageUrl?: string;
    verified?: boolean;
    followerCount?: number;
    followingCount?: number;
  };
  metrics: {
    replyCount: number;
    retweetCount: number;
    likeCount: number;
    viewCount: number;
    bookmarkCount: number;
  };
  isRetweet: boolean;
  isQuote: boolean;
  isReply: boolean;
  inReplyToUserId?: string;
  quotedTweet?: ParsedTweet;
  media?: Array<{
    type: "photo" | "video" | "animated_gif";
    url: string;
    width?: number;
    height?: number;
  }>;
  urls?: Array<{
    url: string;
    expandedUrl: string;
    displayUrl: string;
  }>;
  hashtags?: string[];
  mentions?: Array<{
    id: string;
    username: string;
    name: string;
  }>;
}

interface TimelineResponse {
  tweets: ParsedTweet[];
  user?: {
    id: string;
    username: string;
    name: string;
    description?: string;
    profileImageUrl?: string;
    verified?: boolean;
    followerCount?: number;
    followingCount?: number;
  };
  duration?: number;
}

/**
 * X User Feed Node
 *
 * Scrapes tweets from a Twitter/X user timeline when triggered.
 * Uses the xscraper service to fetch and parse tweets.
 */
export default class XUserFeedNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private lastScrapeTime: number = 0;
  private lastTweetCount: number = 0;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const triggerInput = inputs.trigger;
    const usernameInput = inputs.username;

    // Only process when triggered (by either trigger or username input)
    if (triggerInput === undefined && usernameInput === undefined) {
      return {};
    }

    // Username priority: input port > settings
    const usernameFromInput =
      usernameInput?.value != null
        ? String(usernameInput.value).replace(/^@/, "").trim()
        : "";
    const username = usernameFromInput || this.config.username?.trim();
    if (!username) {
      return {
        error: new DataPacket({
          code: "MISSING_USERNAME",
          message: "Username is required",
          timestamp: Date.now(),
        }),
      };
    }

    const scrollCount = Math.max(
      1,
      Math.min(10, Number(this.config.scrollCount) || 3),
    );

    context.logger.info(
      `Scraping @${username} timeline (scrolls: ${scrollCount})...`,
    );

    try {
      const startTime = Date.now();

      const response = await fetch(
        `http://xscraper:8918/timeline/${username}?scrolls=${scrollCount}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        context.logger.error(
          `XScraper error: ${response.status} - ${errorText}`,
        );

        return {
          error: new DataPacket({
            code: "SCRAPE_FAILED",
            message: `Failed to scrape @${username}: ${response.status}`,
            details: errorText,
            timestamp: Date.now(),
          }),
        };
      }

      const data: TimelineResponse = await response.json();
      const duration = Date.now() - startTime;

      this.lastScrapeTime = Date.now();
      this.lastTweetCount = data.tweets?.length || 0;

      context.logger.info(
        `Scraped ${data.tweets?.length || 0} tweets from @${username} in ${duration}ms`,
      );

      const result: Record<string, DataPacket> = {
        tweets: new DataPacket(data.tweets || []),
      };

      if (data.user) {
        result.user = new DataPacket(data.user);
      }

      return result;
    } catch (err: any) {
      context.logger.error(`Failed to scrape @${username}: ${err.message}`);

      return {
        error: new DataPacket({
          code: "NETWORK_ERROR",
          message: err.message || "Failed to connect to xscraper",
          timestamp: Date.now(),
        }),
      };
    }
  }

  /**
   * Get state for renderer/API
   */
  public getState(): {
    username: string;
    scrollCount: number;
    lastScrapeTime: number | null;
    lastTweetCount: number;
  } {
    return {
      username: this.config.username || "",
      scrollCount: this.config.scrollCount || 3,
      lastScrapeTime: this.lastScrapeTime || null,
      lastTweetCount: this.lastTweetCount,
    };
  }
}
