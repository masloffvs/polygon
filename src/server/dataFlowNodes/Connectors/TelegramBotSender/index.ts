import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
  DataPacket,
  type ErrorPacket,
  isTelegramMessageRequest,
  isTypedImage,
  type NodeManifest,
  type TelegramDocumentMessage,
  type TelegramImageMessage,
  type TelegramMessageRequest,
  type TelegramSendResult,
  type TelegramTextMessage,
  type TypedImage,
  type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

interface TelegramAPIResponse {
  ok: boolean;
  result?: {
    message_id: number;
    chat: { id: number; title?: string };
    date: number;
  };
  description?: string;
  error_code?: number;
  parameters?: {
    retry_after?: number;
  };
}

/**
 * Sanitize text by replacing service tags with newlines
 */
function sanitizeText(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n").replace(/:break;/g, "\n");
}

/**
 * TelegramBotSender Node
 *
 * Universal Telegram message sender that accepts typed message requests.
 * Supports text, photo, document, and other message types.
 */
export default class TelegramBotSenderNode extends DataFlowNode {
  public readonly manifest: NodeManifest = manifest as NodeManifest;

  constructor(id: UUID, config: Record<string, any> = {}) {
    super(id, config);
  }

  /**
   * Send text message
   */
  private async sendTextMessage(
    botToken: string,
    chatId: string | number,
    message: TelegramTextMessage,
  ): Promise<TelegramAPIResponse> {
    const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`;

    const body: Record<string, any> = {
      chat_id: chatId,
      text: sanitizeText(message.text),
      disable_notification: message.silent ?? false,
      protect_content: message.protectContent ?? false,
    };

    if (message.parseMode) {
      body.parse_mode = message.parseMode;
    }
    if (message.disableWebPagePreview) {
      body.disable_web_page_preview = true;
    }
    if (message.replyToMessageId) {
      body.reply_to_message_id = message.replyToMessageId;
    }

    return this.makeRequest(url, body);
  }

  /**
   * Send photo message
   */
  private async sendPhotoMessage(
    botToken: string,
    chatId: string | number,
    message: TelegramImageMessage,
  ): Promise<TelegramAPIResponse> {
    const url = `${TELEGRAM_API_BASE}${botToken}/sendPhoto`;

    // Determine photo source
    let photoValue: string;
    if (isTypedImage(message.photo)) {
      // Base64 image - need to send as multipart/form-data
      return this.sendPhotoAsFormData(botToken, chatId, message);
    } else {
      // URL or file_id
      photoValue = message.photo;
    }

    const body: Record<string, any> = {
      chat_id: chatId,
      photo: photoValue,
      disable_notification: message.silent ?? false,
      protect_content: message.protectContent ?? false,
    };

    if (message.caption) {
      body.caption = sanitizeText(message.caption);
    }
    if (message.parseMode) {
      body.parse_mode = message.parseMode;
    }
    if (message.hasSpoiler) {
      body.has_spoiler = true;
    }
    if (message.showCaptionAboveMedia) {
      body.show_caption_above_media = true;
    }
    if (message.replyToMessageId) {
      body.reply_to_message_id = message.replyToMessageId;
    }

    return this.makeRequest(url, body);
  }

  /**
   * Send photo as multipart/form-data (for base64 images)
   */
  private async sendPhotoAsFormData(
    botToken: string,
    chatId: string | number,
    message: TelegramImageMessage,
  ): Promise<TelegramAPIResponse> {
    const url = `${TELEGRAM_API_BASE}${botToken}/sendPhoto`;
    const typedImage = message.photo as TypedImage;

    // Convert base64 to Blob
    const binaryString = atob(typedImage.base64 || typedImage.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: typedImage.mimeType });

    // Determine extension
    const ext = typedImage.mimeType.split("/")[1] || "png";
    const filename = typedImage.filename || `image.${ext}`;

    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("photo", blob, filename);

    if (message.caption) {
      formData.append("caption", sanitizeText(message.caption));
    }
    if (message.parseMode) {
      formData.append("parse_mode", message.parseMode);
    }
    if (message.silent) {
      formData.append("disable_notification", "true");
    }
    if (message.hasSpoiler) {
      formData.append("has_spoiler", "true");
    }
    if (message.replyToMessageId) {
      formData.append("reply_to_message_id", String(message.replyToMessageId));
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });
      return (await response.json()) as TelegramAPIResponse;
    } catch (err) {
      return {
        ok: false,
        description: `Network error: ${err}`,
        error_code: 0,
      };
    }
  }

  /**
   * Send document message
   */
  private async sendDocumentMessage(
    botToken: string,
    chatId: string | number,
    message: TelegramDocumentMessage,
  ): Promise<TelegramAPIResponse> {
    const url = `${TELEGRAM_API_BASE}${botToken}/sendDocument`;

    const body: Record<string, any> = {
      chat_id: chatId,
      document: message.document,
      disable_notification: message.silent ?? false,
      protect_content: message.protectContent ?? false,
    };

    if (message.caption) {
      body.caption = sanitizeText(message.caption);
    }
    if (message.parseMode) {
      body.parse_mode = message.parseMode;
    }
    if (message.replyToMessageId) {
      body.reply_to_message_id = message.replyToMessageId;
    }

    return this.makeRequest(url, body);
  }

  /**
   * Make JSON request to Telegram API
   */
  private async makeRequest(
    url: string,
    body: Record<string, any>,
  ): Promise<TelegramAPIResponse> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await response.json()) as TelegramAPIResponse;
    } catch (err) {
      return {
        ok: false,
        description: `Network error: ${err}`,
        error_code: 0,
      };
    }
  }

  /**
   * Send message with retry logic
   */
  private async sendWithRetry(
    botToken: string,
    chatId: string | number,
    message: TelegramMessageRequest,
    context: ProcessingContext,
  ): Promise<TelegramAPIResponse> {
    const maxRetries = this.config.retryOnError
      ? (this.config.maxRetries ?? 3)
      : 0;
    let lastError: TelegramAPIResponse | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let result: TelegramAPIResponse;

      switch (message.type) {
        case "text":
          result = await this.sendTextMessage(
            botToken,
            chatId,
            message as TelegramTextMessage,
          );
          break;
        case "photo":
          result = await this.sendPhotoMessage(
            botToken,
            chatId,
            message as TelegramImageMessage,
          );
          break;
        case "document":
          result = await this.sendDocumentMessage(
            botToken,
            chatId,
            message as TelegramDocumentMessage,
          );
          break;
        default:
          return {
            ok: false,
            description: `Unsupported message type: ${message.type}`,
            error_code: 400,
          };
      }

      if (result.ok) {
        return result;
      }

      lastError = result;

      // Handle rate limiting
      if (result.error_code === 429 && result.parameters?.retry_after) {
        const waitTime = result.parameters.retry_after * 1000;
        context.logger.warn(
          `Rate limited, waiting ${result.parameters.retry_after}s`,
          { attempt },
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      // Don't retry on client errors (400-499 except 429)
      if (
        result.error_code &&
        result.error_code >= 400 &&
        result.error_code < 500
      ) {
        return result;
      }

      // Wait before retry on server errors
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000;
        context.logger.warn(`Retrying in ${backoff}ms`, { attempt });
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    return lastError || { ok: false, description: "Unknown error" };
  }

  public async process(
    inputs: Record<string, DataPacket>,
    context: ProcessingContext,
  ): Promise<Record<string, DataPacket> | ErrorPacket> {
    const messageInput = inputs.message?.value;

    if (!messageInput) {
      return {};
    }

    // Validate input is a proper message request
    if (!isTelegramMessageRequest(messageInput)) {
      context.logger.error("Invalid message request", {
        type: typeof messageInput,
      });
      return {
        error: new DataPacket({
          code: "INVALID_MESSAGE",
          message: "Input is not a valid TelegramMessageRequest",
          received: typeof messageInput,
        }),
      };
    }

    const botToken = this.config.botToken;
    if (!botToken) {
      return {
        code: "TELEGRAM_NO_BOT",
        message: "No bot token configured. Set botToken in node settings.",
        nodeId: this.id,
        traceId: context.traceId,
        timestamp: Date.now(),
        recoverable: true,
      };
    }

    // Determine chat ID (message overrides config)
    const chatId = messageInput.chatId || this.config.defaultChatId;
    if (!chatId) {
      return {
        code: "TELEGRAM_NO_CHAT",
        message: "No chat ID provided. Set in message or node config.",
        nodeId: this.id,
        traceId: context.traceId,
        timestamp: Date.now(),
        recoverable: true,
      };
    }

    // Send the message
    const result = await this.sendWithRetry(
      botToken,
      chatId,
      messageInput,
      context,
    );

    const sendResult: TelegramSendResult = {
      success: result.ok,
      messageId: result.result?.message_id,
      chatId: result.result?.chat?.id || chatId,
      timestamp: result.result?.date,
      error: result.ok ? undefined : result.description,
      errorCode: result.ok ? undefined : result.error_code,
    };

    if (result.ok) {
      context.logger.info("Message sent successfully", {
        messageId: result.result?.message_id,
        type: messageInput.type,
      });
      return {
        result: new DataPacket(sendResult),
      };
    } else {
      context.logger.error("Message send failed", {
        error: result.description,
        code: result.error_code,
      });
      return {
        result: new DataPacket(sendResult),
        error: new DataPacket({
          code: `TELEGRAM_ERROR_${result.error_code}`,
          message: result.description,
          errorCode: result.error_code,
        }),
      };
    }
  }
}
