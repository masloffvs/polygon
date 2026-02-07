import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  type NodeManifest,
  type TelegramTextMessage,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * TelegramTextMessageBuilder Node
 *
 * Simple builder that wraps text input into a typed Telegram text message request.
 */
export default class TelegramTextMessageBuilderNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  public async process(
    inputs: Record<string, DataPacket>,
    _context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const textInput = inputs.text?.value;

    if (textInput === undefined || textInput === null) {
      return {};
    }

    // Build the text with prefix/suffix
    const prefix = this.config.prefix || "";
    const suffix = this.config.suffix || "";
    const text = `${prefix}${String(textInput)}${suffix}`;

    // Build the message
    const message: TelegramTextMessage = {
      type: "text",
      text,
      parseMode:
        (this.config.parseMode as TelegramTextMessage["parseMode"]) ||
        undefined,
      disableWebPagePreview: this.config.disableWebPagePreview || false,
      silent: this.config.silent || false,
    };

    return {
      message: new DataPacket(message),
    };
  }
}
