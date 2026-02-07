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

export interface WantedNotice {
  id: string;
  source: "interpol" | "fbi";
  notice_type: string;
  name: string;
  forename: string;
  title: string;
  description: string;
  date_of_birth: string;
  sex: string;
  nationalities: string[];
  thumbnail_url: string;
  detail_url: string;
  reward: number;
  reward_text: string;
  caution: string;
  subjects: string[];
  field_offices: string[];
  aliases: string[];
  fetched_at: string;
}

export interface InterpolSearchResult {
  query: string;
  matches: WantedNotice[];
  count: number;
  sources: string[];
  searched_at: string;
}

export default class InterpolSearchNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as unknown as NodeManifest;

  constructor(id: UUID, config: Record<string, unknown> = {}) {
    super(id, config);
  }

  async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const queryInput = inputs.query;
    if (!queryInput) {
      return {
        results: new DataPacket(null),
        count: new DataPacket(0),
      };
    }

    const query = String(queryInput.value ?? "").trim();
    if (!query) {
      return {
        results: new DataPacket(null),
        count: new DataPacket(0),
      };
    }

    const limit = Number(this.config.limit ?? 20);
    const sourcesFilter = String(this.config.sources ?? "all");

    try {
      const whereConditions: string[] = [];
      const params: Record<string, string | number> = { limit };

      // Search by name (case-insensitive)
      whereConditions.push(
        "(positionCaseInsensitive(name, {query:String}) > 0 OR positionCaseInsensitive(forename, {query:String}) > 0 OR positionCaseInsensitive(title, {query:String}) > 0)",
      );
      params.query = query;

      // Filter by source
      if (sourcesFilter === "interpol") {
        whereConditions.push("source = 'interpol'");
      } else if (sourcesFilter === "fbi") {
        whereConditions.push("source = 'fbi'");
      }

      const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

      const result = await clickhouse.query({
        query: `
          SELECT
            id, source, notice_type, name, forename, title, description,
            date_of_birth, sex, nationalities, thumbnail_url, detail_url,
            reward, reward_text, caution, subjects, field_offices, aliases,
            fetched_at
          FROM wanted_notices
          ${whereClause}
          ORDER BY reward DESC, fetched_at DESC
          LIMIT {limit:Int32}
        `,
        query_params: params,
        format: "JSONEachRow",
      });

      const matches = (await result.json()) as WantedNotice[];

      const searchResult: InterpolSearchResult = {
        query,
        matches,
        count: matches.length,
        sources: [...new Set(matches.map((m) => m.source))],
        searched_at: new Date().toISOString(),
      };

      logger.debug(
        { query, count: matches.length },
        "Interpol search completed",
      );

      return {
        results: new DataPacket(searchResult),
        count: new DataPacket(matches.length),
      };
    } catch (err) {
      logger.error({ err, query }, "Interpol search failed");
      return {
        results: new DataPacket(null),
        count: new DataPacket(0),
      };
    }
  }
}
