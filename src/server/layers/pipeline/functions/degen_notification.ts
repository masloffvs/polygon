import { logger } from "@/server/utils/logger";
import { PipelineFunction } from "../function";
import type { DegenEvent } from "../stages/degen_analysis";
import type { ProcessingContext } from "../types";

export class DegenNotificationFunction extends PipelineFunction<DegenEvent> {
	id = "degen-notification-function";
	description = "Sends Telegram alerts for degen trades";
	// We listen to result of analysis, parallel to storage
	inputs = ["degen-analysis"];

	public async execute(
		event: DegenEvent,
		_context: ProcessingContext,
	): Promise<void> {
		const trade = event.whaleTrade || event.trade;
		if (!trade) return;

		// Credentials
		const BOT_TOKEN =
			process.env.TELEGRAM_BOT_TOKEN ||
			"8286991374:AAHdqGaZUT85JRkLzBWhDZfwOQQA0Zxjn-8";
		const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "5967272073";

		const valueUsd = trade.size * trade.price;
		const typeLabel =
			event.degenType === "micro" ? "🦐 MICRO DEGEN" : "🐟 MID DEGEN";
		const eventUrl = `https://polymarket.com/event/${trade.eventSlug}`;

		const text = `
<b>${typeLabel} ALERT</b>
Market: <a href="${eventUrl}">${trade.title.replace(/<[^>]*>/g, "")}</a>
Outcome: <b>${trade.outcome}</b>
Price: <b>${trade.price.toFixed(3)}¢</b>
Value: <b>$${valueUsd.toFixed(2)}</b> (${trade.side})
Wallet: <code>${trade.proxyWallet.slice(0, 6)}...${trade.proxyWallet.slice(-4)}</code>
    `.trim();

		try {
			const response = await fetch(
				`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chat_id: CHAT_ID,
						text: text,
						parse_mode: "HTML",
						disable_web_page_preview: true,
					}),
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				logger.error(
					{ status: response.status, body: errorText },
					"Telegram API Error",
				);
			} else {
				logger.info(
					{ type: event.degenType, chat: CHAT_ID },
					"Telegram alert sent",
				);
			}
		} catch (err) {
			logger.error({ err }, "Failed to send Telegram alert");
		}
	}
}
