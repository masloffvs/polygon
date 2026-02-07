// src/server/observableCards/whale_positions_card.ts
import type { AggregatorLayer } from "../layers/aggregator";
import type { WhalePositionsCurrentOutput } from "../layers/pipeline/stages/whale_positions_current";
import { ObservableCard } from "./base";

interface WhalePositionsCardState {
  positions: {
    user: string;
    username: string;
    category: string;
    title: string;
    outcome: string;
    side: "BUY" | "SELL";
    valueUsd: number;
    pnlPercent: number;
    timestamp: number;
  }[];
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
    largestValue: number;
  };
  lastUpdate: number;
}

export class WhalePositionsCard extends ObservableCard<
  WhalePositionsCurrentOutput,
  WhalePositionsCardState
> {
  constructor(aggregator: AggregatorLayer) {
    super(
      {
        id: "whale-positions-card",
        title: "Whale Positions",
        description: "Large positions (>$300K) from top traders",
        type: "list",
        inputs: ["whale-positions-active"],
      },
      {
        positions: [],
        byCategory: {},
        stats: {
          totalPositions: 0,
          totalValue: 0,
          avgValue: 0,
          largestValue: 0,
        },
        lastUpdate: 0,
      },
      aggregator,
    );
  }

  public process(data: WhalePositionsCurrentOutput, topic: string): void {
    if (topic !== "whale-positions-active") return;

    // Transform positions for display
    const displayPositions = data.positions.slice(0, 20).map((pos) => ({
      user: pos.user,
      username: pos.username,
      category: pos.category,
      title: pos.title,
      outcome: pos.outcome,
      side: pos.side,
      valueUsd: pos.valueUsd,
      pnlPercent: pos.pnlPercent,
      timestamp: pos.timestamp,
    }));

    this.snapshot = {
      positions: displayPositions,
      byCategory: data.byCategory,
      stats: {
        totalPositions: data.stats.totalPositions,
        totalValue: data.stats.totalValue,
        avgValue: data.stats.avgValue,
        largestValue: data.stats.largestPosition?.valueUsd || 0,
      },
      lastUpdate: Date.now(),
    };
  }
}
