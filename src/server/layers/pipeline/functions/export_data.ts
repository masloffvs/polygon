import { exportChannel } from "../../../services/exportChannel";
import { logger } from "../../../utils/logger";
import { PipelineFunction } from "../function";
import type { ProcessingContext, Topic } from "../types";

export interface ExportDataConfig {
  id: string; // The channel ID
  description: string;
  input: Topic;
}

export class ExportDataFunction extends PipelineFunction {
  public id: string;
  public description: string;
  public inputs: Topic[];

  constructor(config: ExportDataConfig) {
    super();
    this.id = config.id;
    this.description = config.description;
    this.inputs = [config.input];

    // Register channel
    exportChannel.registerChannel(this.id);

    // Filtered Channels for Major Coins
    if (this.id === "global-price-feed") {
      ["ETH", "BTC", "SOL", "XRP"].forEach((coin) => {
        exportChannel.registerChannel(`price-feed-${coin}`);
      });
    }
  }

  public async execute(data: any, _context: ProcessingContext): Promise<void> {
    if (process.env.NODE_ENV === "development") {
      logger.info({ channelId: this.id }, "ExportDataFunction: Publishing");
    }
    // Publish data to the ExportChannel
    exportChannel.publish(this.id, data);

    // Smart Routing for specific coins
    if (this.id === "global-price-feed" && data?.symbol) {
      const base = data.symbol.split("-")[0];
      if (["ETH", "BTC", "SOL", "XRP"].includes(base)) {
        exportChannel.publish(`price-feed-${base}`, data);
      }
    }
  }
}
