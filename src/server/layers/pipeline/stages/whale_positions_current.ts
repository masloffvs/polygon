// src/server/layers/pipeline/stages/whale_positions_current.ts
import type {
  WhalePosition,
  WhalePositionsBatch,
} from "../../sources/whale_positions";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export interface WhalePositionsCurrentOutput {
  positions: WhalePosition[];
  byCategory: Record<
    string,
    {
      count: number;
      totalValue: number;
      avgValue: number;
    }
  >;
  stats: {
    totalPositions: number;
    totalValue: number;
    avgValue: number;
    largestPosition: WhalePosition | null;
  };
  timestamp: number;
}

export class WhalePositionsCurrentStage extends PipelineStage<
  WhalePositionsBatch,
  WhalePositionsCurrentOutput
> {
  id = "whale-positions-current";
  description = "Processes whale positions for real-time display";
  inputs = ["whale-positions-source"];
  output = "whale-positions-active";

  // Keep rolling window of positions (last 24h)
  private positions: WhalePosition[] = [];
  private readonly maxAge = 24 * 60 * 60 * 1000; // 24 hours

  public async process(
    data: WhalePositionsBatch,
    _context: ProcessingContext,
  ): Promise<WhalePositionsCurrentOutput | null> {
    if (data.type !== "whale_positions_batch" || !data.positions?.length) {
      return null;
    }

    const now = Date.now();

    // Add new positions
    this.positions.push(...data.positions);

    // Clean up old positions
    this.positions = this.positions.filter(
      (p) => now - p.timestamp < this.maxAge,
    );

    // Sort by value (largest first)
    this.positions.sort((a, b) => b.valueUsd - a.valueUsd);

    // Aggregate by category
    const byCategory: Record<
      string,
      { count: number; totalValue: number; avgValue: number }
    > = {};

    for (const pos of this.positions) {
      if (!byCategory[pos.category]) {
        byCategory[pos.category] = { count: 0, totalValue: 0, avgValue: 0 };
      }
      const catEntry = byCategory[pos.category];
      if (catEntry) {
        catEntry.count++;
        catEntry.totalValue += pos.valueUsd;
      }
    }

    // Calculate averages
    for (const cat of Object.keys(byCategory)) {
      const entry = byCategory[cat];
      if (entry) {
        entry.avgValue = entry.totalValue / entry.count;
      }
    }

    // Calculate overall stats
    const totalValue = this.positions.reduce((sum, p) => sum + p.valueUsd, 0);
    const largestPosition = this.positions[0] || null;

    return {
      positions: this.positions.slice(0, 50), // Top 50 for display
      byCategory,
      stats: {
        totalPositions: this.positions.length,
        totalValue,
        avgValue:
          this.positions.length > 0 ? totalValue / this.positions.length : 0,
        largestPosition,
      },
      timestamp: now,
    };
  }
}
