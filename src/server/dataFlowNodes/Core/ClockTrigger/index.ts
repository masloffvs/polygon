import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * ClockTrigger Node
 *
 * Triggers at specified times based on patterns:
 * - "10:00 AM" or "10:00 PM" (12-hour format)
 * - "10:00" or "23:00" (24-hour format)
 * - "10:0*" or "10:0* PM" (wildcard: 10:00-10:09)
 * - "*:30" (every hour at :30)
 *
 * Uses setInterval to check time every minute.
 */
export default class ClockTriggerNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  private intervalId: Timer | null = null;
  private lastTriggeredMinute: string | null = null;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  /**
   * Parse time pattern and check if current time matches
   */
  public static matchesPattern(
    pattern: string,
    timezone: string,
  ): { matches: boolean; currentTime: string } {
    // Get current time in timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour24 = parseInt(
      parts.find((p) => p.type === "hour")?.value || "0",
      10,
    );
    const minute = parseInt(
      parts.find((p) => p.type === "minute")?.value || "0",
      10,
    );

    // Format current time for display
    const currentTime = `${hour24.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

    // Parse pattern
    const normalizedPattern = pattern.trim().toUpperCase();

    // Check for AM/PM format
    const isPM = normalizedPattern.includes("PM");
    const isAM = normalizedPattern.includes("AM");
    const is12Hour = isPM || isAM;

    // Extract time part (remove AM/PM)
    const timePart = normalizedPattern.replace(/\s*(AM|PM)\s*/gi, "").trim();

    // Split into hours and minutes
    const [patternHour, patternMinute] = timePart
      .split(":")
      .map((s) => s.trim());

    if (!patternHour || !patternMinute) {
      return { matches: false, currentTime };
    }

    // Convert pattern hour to 24-hour format if needed
    let targetHour24: number | null = null;
    const hasWildcardHour = patternHour.includes("*");

    if (!hasWildcardHour) {
      let h = parseInt(patternHour, 10);
      if (is12Hour) {
        // Convert 12-hour to 24-hour
        if (isPM && h !== 12) h += 12;
        if (isAM && h === 12) h = 0;
      }
      targetHour24 = h;
    }

    // Check hour match
    const hourMatches =
      hasWildcardHour || (targetHour24 !== null && hour24 === targetHour24);

    if (!hourMatches) {
      return { matches: false, currentTime };
    }

    // Check minute match (with wildcard support)
    const hasWildcardMinute = patternMinute.includes("*");

    if (hasWildcardMinute) {
      // Handle patterns like "0*" (00-09), "*0" (00,10,20,30,40,50), etc.
      const minuteStr = minute.toString().padStart(2, "0");
      const patternMinuteNorm = patternMinute.padStart(2, "0");

      for (let i = 0; i < 2; i++) {
        const patternChar = patternMinuteNorm[i];
        const actualChar = minuteStr[i];

        if (patternChar !== "*" && patternChar !== actualChar) {
          return { matches: false, currentTime };
        }
      }

      return { matches: true, currentTime };
    } else {
      // Exact minute match
      const targetMinute = parseInt(patternMinute, 10);
      return { matches: minute === targetMinute, currentTime };
    }
  }

  /**
   * Get info about the pattern for display
   */
  public static getPatternInfo(pattern: string): {
    description: string;
    examples: string[];
  } {
    const normalized = pattern.trim().toUpperCase();
    const hasWildcard = pattern.includes("*");

    if (hasWildcard) {
      // Parse wildcard pattern
      const timePart = normalized.replace(/\s*(AM|PM)\s*/gi, "").trim();
      const [hour, minute] = timePart.split(":");

      if (minute?.includes("*")) {
        const _examples: string[] = [];
        const _minuteBase = minute.replace("*", "");

        if (minute === "*") {
          // Every minute of the hour
          return {
            description: `Every minute at ${hour}:XX`,
            examples: [`${hour}:00`, `${hour}:15`, `${hour}:30`, `${hour}:45`],
          };
        } else if (minute.startsWith("*")) {
          // Pattern like *0, *5
          const suffix = minute.slice(1);
          return {
            description: `At minutes ending with ${suffix}`,
            examples: [
              `${hour}:0${suffix}`,
              `${hour}:1${suffix}`,
              `${hour}:2${suffix}`,
            ],
          };
        } else {
          // Pattern like 0*, 1*, 2*
          const prefix = minute.slice(0, 1);
          return {
            description: `Minutes ${prefix}0-${prefix}9`,
            examples: [
              `${hour}:${prefix}0`,
              `${hour}:${prefix}5`,
              `${hour}:${prefix}9`,
            ],
          };
        }
      }

      if (hour?.includes("*")) {
        return {
          description: `Every hour at :${minute}`,
          examples: [`00:${minute}`, `12:${minute}`, `23:${minute}`],
        };
      }
    }

    return {
      description: `At exactly ${pattern}`,
      examples: [],
    };
  }

  public async initialize(): Promise<void> {
    const enabled = this.config.enabled !== false;
    if (!enabled) return;

    // Check every 30 seconds (to be more precise)
    this.intervalId = setInterval(() => {
      this.checkTime();
    }, 30000);

    // Also check immediately
    this.checkTime();
  }

  private checkTime(): void {
    const pattern = this.config.pattern || "10:00 AM";
    const timezone = this.config.timezone || "UTC";

    const { matches, currentTime } = ClockTriggerNode.matchesPattern(
      pattern,
      timezone,
    );

    // Prevent double-triggering in the same minute
    const minuteKey = currentTime;
    if (matches && this.lastTriggeredMinute !== minuteKey) {
      this.lastTriggeredMinute = minuteKey;
      this.emitTrigger(currentTime, timezone);
    }
    // Don't reset lastTriggeredMinute here - only update when we match a NEW minute
  }

  private emitTrigger(currentTime: string, timezone: string): void {
    const payload = {
      triggeredAt: new Date().toISOString(),
      localTime: currentTime,
      timezone,
      pattern: this.config.pattern,
    };

    this.onEmit?.({
      trigger: new DataPacket(payload),
    });
  }

  /**
   * Get current state for API/renderer
   */
  public getState(): {
    pattern: string;
    timezone: string;
    currentTime: string;
    enabled: boolean;
    patternInfo: { description: string; examples: string[] };
  } {
    const pattern = this.config.pattern || "10:00 AM";
    const timezone = this.config.timezone || "UTC";
    const enabled = this.config.enabled !== false;

    const { currentTime } = ClockTriggerNode.matchesPattern(pattern, timezone);
    const patternInfo = ClockTriggerNode.getPatternInfo(pattern);

    return {
      pattern,
      timezone,
      currentTime,
      enabled,
      patternInfo,
    };
  }

  public async process(
    _inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    // This node is trigger-based, no input processing needed
    return {};
  }

  public async dispose(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
