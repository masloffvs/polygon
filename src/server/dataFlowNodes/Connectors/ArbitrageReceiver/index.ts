import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import {
  type ExportEvent,
  exportChannel,
} from "../../../services/exportChannel";
import { logger } from "../../../utils/logger";
import manifest from "./schema.json";

interface ArbitrageOpportunity {
  pair: string;
  exchangeBuy: string;
  exchangeSell: string;
  priceBuy: number;
  priceSell: number;
  spreadPercent: number;
  spreadUsd: number;
}

export default class ArbitrageReceiverNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;
  private unsubscribe: (() => void) | null = null;
  private lastEmitTime: Record<string, number> = {};

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
    logger.info({ nodeId: id, config }, "ArbitrageReceiverNode: Initializing");
    this.setupSubscription();
  }

  private get minSpreadPercent(): number {
    return this.config.minSpreadPercent ?? 0.3;
  }

  private get maxSpreadPercent(): number {
    return this.config.maxSpreadPercent ?? 10;
  }

  private get cooldownMs(): number {
    return (this.config.cooldownSeconds ?? 60) * 1000;
  }

  private get filterPairs(): string[] {
    const filter = this.config.filterPairs || "";
    if (!filter.trim()) return [];
    return filter
      .split(",")
      .map((p: string) => p.trim().toUpperCase())
      .filter(Boolean);
  }

  private get filterExchanges(): string[] {
    const filter = this.config.filterExchanges || "";
    if (!filter.trim()) return [];
    return filter
      .split(",")
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  private setupSubscription() {
    // Always subscribe to arbitrage-card-channel
    const channelId = "arbitrage-card-channel";

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    logger.info(
      { nodeId: this.id, channelId },
      "ArbitrageReceiver: Subscribing",
    );

    this.unsubscribe = exportChannel.subscribe(
      channelId,
      (event: ExportEvent) => {
        const data = event.data as ArbitrageOpportunity;
        if (!data || typeof data.spreadPercent !== "number") {
          return;
        }

        // Apply filters
        if (!this.shouldEmit(data)) {
          return;
        }

        logger.info(
          {
            nodeId: this.id,
            pair: data.pair,
            spread: data.spreadPercent,
          },
          "ArbitrageReceiver: Emitting opportunity",
        );

        this.onEmit?.({
          opportunity: new DataPacket(data),
        });
      },
    );
  }

  private shouldEmit(data: ArbitrageOpportunity): boolean {
    const minSpread = this.minSpreadPercent;
    const maxSpread = this.maxSpreadPercent;

    // Check spread threshold
    if (data.spreadPercent < minSpread) {
      return false;
    }

    if (data.spreadPercent > maxSpread) {
      return false;
    }

    // Check pair filter
    const pairs = this.filterPairs;
    if (pairs.length > 0) {
      const pairBase = data.pair.split("/")[0]?.trim().toUpperCase() || "";
      if (!pairs.some((p) => pairBase.includes(p) || p.includes(pairBase))) {
        return false;
      }
    }

    // Check exchange filter
    const exchanges = this.filterExchanges;
    if (exchanges.length > 0) {
      const buyExchange = data.exchangeBuy.toLowerCase();
      const sellExchange = data.exchangeSell.toLowerCase();
      if (
        !exchanges.some(
          (e) => buyExchange.includes(e) || sellExchange.includes(e),
        )
      ) {
        return false;
      }
    }

    // Check cooldown
    const cooldownKey = `${data.pair}-${data.exchangeBuy}-${data.exchangeSell}`;
    const now = Date.now();
    const lastEmit = this.lastEmitTime[cooldownKey] || 0;

    if (now - lastEmit < this.cooldownMs) {
      return false;
    }

    this.lastEmitTime[cooldownKey] = now;
    return true;
  }

  public async process(
    _inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    // Source node - emits via subscription, not process()
    return {};
  }

  public async dispose() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}
