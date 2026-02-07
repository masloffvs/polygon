import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

export interface NewsArticle {
  uuid: string;
  original_id: string;
  source: string;
  content: string;
  url: string;
  author: string;
  score: number;
  published_at: string;
  created_at: string;
  similarity?: number;
}

export interface NewsSearchResult {
  query: string;
  articles: NewsArticle[];
  count: number;
  searched_at: string;
}

const TIME_RANGE_MAP: Record<string, string> = {
  "1h": "1 HOUR",
  "6h": "6 HOUR",
  "24h": "24 HOUR",
  "7d": "7 DAY",
  "30d": "30 DAY",
  all: "",
};

export default class NewsAssociatedNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as unknown as NodeManifest;

  constructor(id: UUID, config: Record<string, unknown> = {}) {
    super(id, config);
  }

  async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const textInput = inputs.text;
    if (!textInput) {
      return {
        news: new DataPacket([]),
        count: new DataPacket(0),
      };
    }

    const text = String(textInput.value ?? "").trim();
    if (!text) {
      return {
        news: new DataPacket([]),
        count: new DataPacket(0),
      };
    }

    const limit = Number(this.config.limit ?? 10);
    const timeRange = String(this.config.timeRange ?? "24h");

    try {
      // Build time filter
      const timeFilter = TIME_RANGE_MAP[timeRange];
      const whereConditions: string[] = [];
      const params: Record<string, string | number> = { limit };

      if (timeFilter) {
        whereConditions.push(`published_at >= now() - INTERVAL ${timeFilter}`);
      }

      // Text search using position matching (for now - vector search can be added later)
      // Search in content field
      const searchTerms = text
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

      if (searchTerms.length > 0) {
        const searchConditions = searchTerms
          .map(
            (_, i) => `positionCaseInsensitive(content, {term${i}:String}) > 0`,
          )
          .join(" OR ");
        whereConditions.push(`(${searchConditions})`);

        searchTerms.forEach((term, i) => {
          params[`term${i}`] = term;
        });
      }

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(" AND ")}`
          : "";

      // Query from both news_feed and news_api_articles
      const query = `
        SELECT 
          uuid,
          original_id,
          source,
          content,
          url,
          author,
          score,
          published_at,
          created_at
        FROM (
          SELECT 
            uuid,
            original_id,
            source,
            content,
            url,
            author,
            score,
            published_at,
            created_at
          FROM news_feed FINAL
          
          UNION ALL
          
          SELECT 
            id as uuid,
            id as original_id,
            source_name as source,
            concat(title, '. ', coalesce(description, '')) as content,
            url,
            coalesce(author, 'Unknown') as author,
            0.0 as score,
            published_at,
            ingested_at as created_at
          FROM news_api_articles
        )
        ${whereClause}
        ORDER BY published_at DESC
        LIMIT {limit:Int32}
      `;

      logger.debug({ query, params }, "NewsAssociated query");

      const result = await clickhouse.query({
        query,
        query_params: params,
        format: "JSONEachRow",
      });

      const articles = (await result.json()) as NewsArticle[];

      const searchResult: NewsSearchResult = {
        query: text,
        articles,
        count: articles.length,
        searched_at: new Date().toISOString(),
      };

      logger.info(
        { query: text, count: articles.length },
        "NewsAssociated search completed",
      );

      return {
        news: new DataPacket(searchResult),
        count: new DataPacket(articles.length),
      };
    } catch (err) {
      logger.error({ err, text }, "NewsAssociated search failed");
      return {
        news: new DataPacket(null),
        count: new DataPacket(0),
      };
    }
  }
}
