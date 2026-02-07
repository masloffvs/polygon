import { logger } from "../server/utils/logger";

export const getWantedRoutes = () => ({
  "/api/wanted/notices": {
    async GET(req: Request) {
      const url = new URL(req.url);
      const source = url.searchParams.get("source"); // "interpol" | "fbi" | null (all)
      const noticeType = url.searchParams.get("type"); // "red" | "yellow" | "un" | "wanted" | null
      const limit = parseInt(url.searchParams.get("limit") || "200", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      const search = url.searchParams.get("search") || "";

      try {
        const { clickhouse } = await import("../storage/clickhouse");

        const whereConditions: string[] = [];
        const params: Record<string, any> = { limit, offset };

        if (source) {
          whereConditions.push("source = {source:String}");
          params.source = source;
        }

        if (noticeType) {
          whereConditions.push("notice_type = {noticeType:String}");
          params.noticeType = noticeType;
        }

        if (search) {
          whereConditions.push(
            "(name ILIKE {search:String} OR forename ILIKE {search:String} OR title ILIKE {search:String})",
          );
          params.search = `%${search}%`;
        }

        const whereClause =
          whereConditions.length > 0
            ? `WHERE ${whereConditions.join(" AND ")}`
            : "";

        const result = await clickhouse.query({
          query: `
              SELECT
                id, source, notice_type, name, forename, title, description,
                date_of_birth, sex, nationalities, thumbnail_url, detail_url,
                reward, reward_text, caution, subjects, field_offices, aliases,
                fetched_at
              FROM wanted_notices FINAL
              ${whereClause}
              ORDER BY fetched_at DESC
              LIMIT {limit:Int32}
              OFFSET {offset:Int32}
            `,
          query_params: params,
          format: "JSONEachRow",
        });
        const data = await result.json();

        // Get counts (deduplicated)
        const countResult = await clickhouse.query({
          query: `
              SELECT
                source,
                notice_type,
                count() as count
              FROM wanted_notices FINAL
              GROUP BY source, notice_type
            `,
          format: "JSONEachRow",
        });
        const counts = (await countResult.json()) as Array<{
          source: string;
          notice_type: string;
          count: string;
        }>;

        const stats = {
          interpol_red: 0,
          interpol_yellow: 0,
          interpol_un: 0,
          fbi_wanted: 0,
          total: 0,
        };

        for (const c of counts) {
          const cnt = parseInt(c.count, 10);
          stats.total += cnt;
          if (c.source === "interpol") {
            if (c.notice_type === "red") stats.interpol_red = cnt;
            if (c.notice_type === "yellow") stats.interpol_yellow = cnt;
            if (c.notice_type === "un") stats.interpol_un = cnt;
          } else if (c.source === "fbi") {
            stats.fbi_wanted = cnt;
          }
        }

        return Response.json({ data, stats });
      } catch (err) {
        logger.error({ err }, "Failed to fetch wanted notices");
        return new Response("Failed to fetch wanted notices", {
          status: 500,
        });
      }
    },
  },
});
