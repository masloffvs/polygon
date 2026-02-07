import { EventEmitter } from "node:events";
import { logger } from "../utils/logger";

export interface ExportEvent {
  channelId: string;
  data: any;
  timestamp: number;
}

const GLOBAL_KEY = Symbol.for("Polygon.ExportChannelService");

class ExportChannelService extends EventEmitter {
  private channels = new Set<string>();
  public readonly serviceId: string;

  private constructor() {
    super();
    this.serviceId = Math.random().toString(36).substring(7);
    logger.info(
      { serviceId: this.serviceId },
      "ExportChannelService: Created Instance",
    );
  }

  public static getInstance(): ExportChannelService {
    if (!(global as any)[GLOBAL_KEY]) {
      (global as any)[GLOBAL_KEY] = new ExportChannelService();
    }
    return (global as any)[GLOBAL_KEY];
  }

  public registerChannel(channelId: string) {
    this.channels.add(channelId);
    logger.info(
      { channelId, serviceId: this.serviceId },
      "Export channel registered",
    );
  }

  public publish(channelId: string, data: any) {
    if (process.env.NODE_ENV === "development") {
      logger.info(
        { channelId, serviceId: this.serviceId },
        "ExportChannelService: Publishing",
      );
    }
    // We emit a specific event for the channel
    this.emit(`data:${channelId}`, {
      channelId,
      data,
      timestamp: Date.now(),
    });
  }

  public subscribe(channelId: string, callback: (event: ExportEvent) => void) {
    logger.info(
      { channelId, serviceId: this.serviceId },
      "ExportChannelService: New Subscriber",
    );
    this.on(`data:${channelId}`, callback);
    return () => this.off(`data:${channelId}`, callback);
  }

  public getChannels(): string[] {
    return Array.from(this.channels);
  }
}

export const exportChannel = ExportChannelService.getInstance();
