import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

interface TelegramSendResult {
	ok: boolean;
	result?: {
		message_id: number;
		chat: { id: number; title?: string };
		date: number;
	};
	description?: string;
	error_code?: number;
}

/**
 * TelegramDrop Node
 *
 * Sends incoming messages to Telegram.
 * Bot token and chat ID are configured directly in node settings.
 */
export default class TelegramDropNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
	}

	/**
	 * Format message content for sending
	 */
	private formatMessage(data: any): string {
		const prefix = this.config.prefix || "";

		let content: string;
		if (typeof data === "string") {
			content = data;
		} else if (typeof data === "object") {
			try {
				content = JSON.stringify(data, null, 2);
			} catch {
				content = String(data);
			}
		} else {
			content = String(data);
		}

		return prefix ? `${prefix}\n${content}` : content;
	}

	/**
	 * Send message to Telegram
	 */
	private async sendTelegram(
		botToken: string,
		chatId: string,
		text: string,
	): Promise<TelegramSendResult> {
		const url = `${TELEGRAM_API_BASE}${botToken}/sendMessage`;

		const parseMode = this.config.parseMode || "HTML";
		const silent = this.config.silent || false;

		const body: Record<string, any> = {
			chat_id: chatId,
			text: text,
			disable_notification: silent,
		};

		if (parseMode && parseMode !== "none" && parseMode !== "") {
			body.parse_mode = parseMode;
		}

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			return (await response.json()) as TelegramSendResult;
		} catch (err) {
			return {
				ok: false,
				description: `Network error: ${err}`,
				error_code: 0,
			};
		}
	}

	public async process(
		inputs: Record<string, DataPacket>,
		context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const messageData = inputs.message?.value;

		if (messageData === undefined || messageData === null) {
			return {};
		}

		const botToken = this.config.botToken;
		const chatId = this.config.chatId;

		if (!botToken) {
			context.logger.error("TelegramDrop: No bot token configured");
			return {
				code: "TELEGRAM_NO_BOT",
				message: "No bot token configured. Set botToken in node settings.",
				nodeId: this.id,
				traceId: context.traceId,
				timestamp: Date.now(),
				recoverable: true,
			};
		}

		if (!chatId) {
			context.logger.error("TelegramDrop: No chat ID configured");
			return {
				code: "TELEGRAM_NO_CHAT",
				message: "No chat ID configured. Set chatId in node settings.",
				nodeId: this.id,
				traceId: context.traceId,
				timestamp: Date.now(),
				recoverable: true,
			};
		}

		// Format and send
		const text = this.formatMessage(messageData);
		const result = await this.sendTelegram(botToken, chatId, text);

		if (result.ok) {
			context.logger.info("TelegramDrop: Message sent", {
				chatId,
				messageId: result.result?.message_id,
			});

			return {
				result: new DataPacket({
					success: true,
					messageId: result.result?.message_id,
					chatId: result.result?.chat?.id,
					timestamp: result.result?.date,
				}),
			};
		} else {
			context.logger.error("TelegramDrop: Send failed", {
				error: result.description,
				code: result.error_code,
			});

			return {
				result: new DataPacket({
					success: false,
					error: result.description,
					errorCode: result.error_code,
				}),
			};
		}
	}
}
