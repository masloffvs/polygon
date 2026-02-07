// src/server/layers/pipeline/stages/whale_positions_storage.ts
import { logger } from "@/server/utils/logger";
import { clickhouse } from "@/storage/clickhouse";
import type {
  WhalePosition,
  WhalePositionsBatch,
} from "../../sources/whale_positions";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class WhalePositionsStorageStage extends PipelineStage<
  WhalePositionsBatch,
  { stored: number }
> {
  id = "whale-positions-storage";
  description = "Stores whale positions (>$300K) to ClickHouse";
  inputs = ["whale-positions-source"];
  output = "whale-positions-stored";

  public async process(
    data: WhalePositionsBatch,
    _context: ProcessingContext,
  ): Promise<{ stored: number } | null> {
    if (data.type !== "whale_positions_batch" || !data.positions?.length) {
      return null;
    }

    const rows = data.positions.map((pos: WhalePosition) => ({
      user_address: pos.user,
      username: pos.username,
      profile_image: pos.profileImage,
      category: pos.category,
      asset: pos.asset,
      title: pos.title,
      outcome: pos.outcome,
      side: pos.side,
      size: pos.size,
      avg_price: pos.avgPrice,
      current_price: pos.currentPrice,
      value_usd: pos.valueUsd,
      pnl: pos.pnl,
      pnl_percent: pos.pnlPercent,
      timestamp: new Date(pos.timestamp),
    }));

    try {
      await clickhouse.insert({
        table: "whale_positions",
        values: rows,
        format: "JSONEachRow",
      });

      logger.info(
        { stage: this.id, stored: rows.length },
        "Stored whale positions",
      );

      return { stored: rows.length };
    } catch (err) {
      logger.error({ err, stage: this.id }, "Failed to store whale positions");
      return null;
    }
  }
}
