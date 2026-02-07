import type { Application } from "../server/application";
import { logger } from "../server/utils/logger";

export const getPredictionRoutes = (app: Application) => ({
  "/api/predictions/realtime": {
    async GET(_req: Request) {
      try {
        const state = app.getSmartMoneyRealTimeState();
        return Response.json(state);
      } catch (err) {
        logger.error({ err }, "Failed to get smart money realtime state");
        return new Response("Internal Error", { status: 500 });
      }
    },
  },

  "/api/predictions/symbol-history/:symbol": {
    async GET(req: Request) {
      try {
        const url = new URL(req.url);
        const symbol = url.pathname.split("/").pop();

        if (!symbol) {
          return new Response("Symbol required", { status: 400 });
        }

        const { clickhouse } = await import("../storage/clickhouse");

        // Get prediction history for this symbol
        const query = `
            SELECT
              window_start as timestamp,
              phase,
              direction,
              confidence,
              entry_price,
              close_price as exit_price,
              is_win,
              pnl_percent,
              analyzed_at
            FROM smart_money_performance
            WHERE symbol = {symbol:String}
            ORDER BY window_start DESC
            LIMIT 100
          `;

        const result = await clickhouse.query({
          query,
          query_params: { symbol: symbol.toUpperCase() },
          format: "JSONEachRow",
        });
        const predictions = (await result.json()) as any[];

        // Calculate stats
        const completed = predictions.filter((p) => p.is_win !== null); // All rows are completed outcomes
        const wins = completed.filter((p) => p.is_win === 1).length;
        const losses = completed.filter((p) => p.is_win === 0).length;
        const pending = 0; // Performance table only stores completed
        const totalCompleted = wins + losses;

        const stats = {
          totalPredictions: totalCompleted,
          wins,
          losses,
          pending,
          winRate: totalCompleted > 0 ? (wins / totalCompleted) * 100 : 0,
          avgConfidence:
            completed.length > 0
              ? completed.reduce((acc, p) => acc + (p.confidence || 0), 0) /
                completed.length
              : 0,
          avgPnl:
            completed.length > 0
              ? completed.reduce((acc, p) => acc + (p.pnl_percent || 0), 0) /
                completed.length
              : 0,
        };

        // Map predictions
        const mappedPredictions = predictions.map((p) => ({
          timestamp: new Date(p.timestamp).getTime(),
          phase: p.phase,
          direction: p.direction,
          confidence: p.confidence || 0,
          openPrice: p.entry_price, // entry_price is solid
          closePrice: p.exit_price,
          pnl: p.pnl_percent,
          outcome: p.is_win === 1 ? "WIN" : "LOSS",
        }));

        return Response.json({
          predictions: mappedPredictions,
          stats,
        });
      } catch (err) {
        logger.error({ err }, "Failed to fetch symbol prediction history");
        return new Response("Internal Error", { status: 500 });
      }
    },
  },

  "/api/predictions/history": {
    async GET(_req: Request) {
      try {
        const { clickhouse } = await import("../storage/clickhouse");

        // 1. Get Global Average History
        const globalQuery = `
            SELECT
                window_start,
                window_end,
                sum(total_size) as volume,
                sum(if(is_profitable=1, total_size, 0)) / nullIf(sum(total_size), 0) * 100 as accuracy,
                sum(if(outcome IN ('UP', 'YES'), total_size, 0)) / nullIf(sum(total_size), 0) * 100 as longRatio
            FROM crypto_trader_performance_snapshots
            GROUP BY window_start, window_end
            ORDER BY window_start DESC
            LIMIT 100
          `;

        const globalResult = await clickhouse.query({
          query: globalQuery,
          format: "JSONEachRow",
        });
        const globalData = await globalResult.json();

        // 2. Get Individual Trader Histories
        const tradersQuery = `
            SELECT
                user_name,
                window_start,
                sum(if(is_profitable=1, total_size, 0)) / nullIf(sum(total_size), 0) * 100 as accuracy
            FROM crypto_trader_performance_snapshots
            GROUP BY window_start, user_name
            HAVING accuracy IS NOT NULL
            ORDER BY window_start ASC
            LIMIT 2000
          `;

        const tradersResult = await clickhouse.query({
          query: tradersQuery,
          format: "JSONEachRow",
        });
        const tradersRows = await tradersResult.json();

        // 3. Get Asset Histories (Top 5 by volume)
        const assetsQuery = `
            SELECT
                asset,
                window_start,
                sum(if(is_profitable=1, total_size, 0)) / nullIf(sum(total_size), 0) * 100 as accuracy,
                avg(current_spot_price) as price
            FROM crypto_trader_performance_snapshots
            WHERE asset IN (
                SELECT asset FROM crypto_trader_performance_snapshots
                GROUP BY asset
                ORDER BY sum(total_size) DESC
                LIMIT 5
            )
            GROUP BY window_start, asset
            HAVING accuracy IS NOT NULL
            ORDER BY window_start ASC
          `;

        const assetsResult = await clickhouse.query({
          query: assetsQuery,
          format: "JSONEachRow",
        });
        const assetsRows = await assetsResult.json();

        // Group by asset
        const assets: Record<string, any[]> = {};
        (assetsRows as any[]).forEach((row) => {
          if (!assets[row.asset]) assets[row.asset] = [];
          assets[row.asset].push({
            date: new Date(row.window_start).getTime(),
            accuracy: row.accuracy,
            price: row.price,
          });
        });

        // Group by user
        const traders: Record<string, any[]> = {};
        (tradersRows as any[]).forEach((row) => {
          if (!traders[row.user_name]) traders[row.user_name] = [];
          traders[row.user_name].push({
            date: new Date(row.window_start).getTime(),
            accuracy: row.accuracy,
          });
        });

        // Map global
        const mappedGlobal = (globalData as any[]).map((d) => ({
          windowStart: new Date(d.window_start).getTime(),
          windowEnd: new Date(d.window_end).getTime(),
          accuracy: d.accuracy,
          volume: d.volume,
          longRatio: d.longRatio,
        }));

        return Response.json({
          global: mappedGlobal,
          traders: traders,
          assets: assets,
        });
      } catch (err) {
        logger.error({ err }, "Failed to fetch prediction history");
        return new Response("Failed to fetch prediction history", {
          status: 500,
        });
      }
    },
  },

  "/api/predictions/top-assets": {
    async GET(_req: Request) {
      try {
        const { clickhouse } = await import("../storage/clickhouse");
        // Get top assets by volume, calculating their accuracy
        const query = `
            SELECT
                asset,
                sum(total_size) as total_volume,
                sum(if(is_profitable=1, total_size, 0)) / nullIf(sum(total_size), 0) * 100 as accuracy,
                count() as trade_count
            FROM crypto_trader_performance_snapshots
            GROUP BY asset
            HAVING total_volume > 0
            ORDER BY accuracy DESC, total_volume DESC
            LIMIT 1
          `;

        const result = await clickhouse.query({
          query,
          format: "JSONEachRow",
        });
        const data = await result.json();
        // Returns array, we want the first one or null
        const top = (data as any[])[0] || null;

        return Response.json(top);
      } catch (err) {
        logger.error({ err }, "Failed to fetch top assets");
        return new Response("Failed to fetch top assets", { status: 500 });
      }
    },
  },
});
