import {
  type ProcessingContext,
  type StateAdapter,
  StatefulNode,
} from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

interface BufferedPrimary {
  value: unknown;
  arrivedAt: number;
}

/**
 * Enricher (TTL Merge): Stores the primary object in memory for TTL ms.
 * If enrichment arrives within TTL, merges and emits.
 * On TTL expiry, emits to 'expired' or drops.
 */
export default class EnricherNode extends StatefulNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private pendingPrimary: BufferedPrimary | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    id: UUID,
    config: Record<string, any> = {},
    stateAdapter?: StateAdapter,
  ) {
    super(id, config, stateAdapter);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const ttlMs = Number(this.config.ttlMs ?? 5000);
    const mergeStrategy = this.config.mergeStrategy || "shallow";
    const onExpire = this.config.onExpire || "emit";

    const hasPrimary = inputs.primary !== undefined;
    const hasEnrichment = inputs.enrichment !== undefined;

    // New primary arrives — store it
    if (hasPrimary) {
      this.clearTimer();
      this.pendingPrimary = {
        value: inputs.primary.value,
        arrivedAt: Date.now(),
      };

      // Set expiry timer — uses onEmit for async emission
      this.expiryTimer = setTimeout(() => {
        if (this.pendingPrimary) {
          const expired = this.pendingPrimary.value;
          this.pendingPrimary = null;

          if (onExpire === "emit") {
            this.emit({
              merged: new DataPacket(null),
              expired: new DataPacket(expired),
            });
          }
        }
      }, ttlMs);
    }

    // Enrichment arrives — try to merge with pending primary
    if (hasEnrichment && this.pendingPrimary) {
      this.clearTimer();
      const primary = this.pendingPrimary.value;
      const enrichment = inputs.enrichment.value;
      this.pendingPrimary = null;

      let merged: unknown;
      if (mergeStrategy === "nest") {
        merged = { primary, enrichment };
      } else {
        // shallow merge
        merged =
          typeof primary === "object" &&
          primary !== null &&
          typeof enrichment === "object" &&
          enrichment !== null
            ? { ...primary, ...enrichment }
            : { primary, enrichment };
      }

      return {
        merged: new DataPacket(merged),
        expired: new DataPacket(null),
      };
    }

    // No action yet (waiting)
    return {
      merged: new DataPacket(null),
      expired: new DataPacket(null),
    };
  }

  private clearTimer() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  public async dispose(): Promise<void> {
    this.clearTimer();
    this.pendingPrimary = null;
  }
}
