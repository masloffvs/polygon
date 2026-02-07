import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { logger } from "../../../utils/logger";
import type { AgentConfig } from "../agent";
import {
	ExportedAgent,
	type ExportedAgentManifest,
	registerExportedAgent,
} from "../exported_agent";

interface Any2TextInput {
	data: any;
}

interface Any2TextOutput {
	text: string;
	timestamp: number;
}

/**
 * Any2Text Agent
 *
 * Converts any structured data into human-readable text.
 * Useful for:
 * - Preparing data for Telegram/Discord notifications
 * - Converting JSON to readable reports
 * - Summarizing complex data structures
 */
export class Any2TextAgent extends ExportedAgent<any, Any2TextOutput> {
	readonly agentManifest: ExportedAgentManifest = {
		id: "any2text",
		name: "Any → Text",
		description: "Converts any data into human-readable text using AI",
		category: "AI",
		ui: {
			color: "#8b5cf6",
			icon: "text",
		},
		settings: [
			{
				name: "style",
				type: "select",
				label: "Output Style",
				defaultValue: "brief",
				options: [
					{ label: "Brief Summary", value: "brief" },
					{ label: "Detailed Report", value: "detailed" },
					{ label: "Bullet Points", value: "bullets" },
					{ label: "Telegram Message", value: "telegram" },
					{ label: "Custom Prompt", value: "custom" },
				],
			},
			{
				name: "customPrompt",
				type: "text",
				label: "Custom Prompt",
				defaultValue: "",
			},
			{
				name: "maxLength",
				type: "number",
				label: "Max Characters",
				defaultValue: 500,
			},
			{
				name: "language",
				type: "select",
				label: "Language",
				defaultValue: "en",
				options: [
					{ label: "English", value: "en" },
					{ label: "Russian", value: "ru" },
					{ label: "Auto (match input)", value: "auto" },
				],
			},
		],
	};

	readonly agentConfig: AgentConfig = {
		provider: "openrouter",
		model: "tngtech/deepseek-r1t2-chimera:free",
		systemPrompt: [
			"You are a strict data formatter.",
			"Your ONLY job is to convert the provided JSON/structured data into readable text.",
			"",
			"Rules:",
			"1) ONLY describe what is present in the data - do not add, assume, or infer anything not explicitly stated.",
			"2) Do not explain, interpret, or provide context beyond the data.",
			"3) If data is unclear, say so instead of guessing.",
			"4) Never generate information that is not directly in the input.",
		].join(" "),
	};

	readonly pipelineInputs = ["any-data"];
	readonly pipelineOutput = "formatted-text";

	private openrouter: ReturnType<typeof createOpenRouter>;

	constructor() {
		super();

		const apiKey = process.env.OPENROUTER_API_KEY;
		if (!apiKey) {
			throw new Error("OPENROUTER_API_KEY is required for Any2TextAgent");
		}

		this.openrouter = createOpenRouter({
			apiKey,
			headers: {
				"HTTP-Referer": "https://polygon-bot.com",
				"X-Title": "Polygon Bot - Any2Text",
			},
		});
	}

	private getStylePrompt(style: string, maxLength: number): string {
		switch (style) {
			case "brief":
				return `Summarize in ${maxLength} characters or less. Be concise.`;
			case "detailed":
				return `Provide a detailed explanation. Max ${maxLength} characters.`;
			case "bullets":
				return `Format as bullet points. Max ${maxLength} characters.`;
			case "telegram":
				return `Format for Telegram message. Use emojis appropriately. Max ${maxLength} characters. Keep it engaging and easy to read on mobile.`;
			default:
				return `Convert to readable text. Max ${maxLength} characters.`;
		}
	}

	private getLanguageInstruction(lang: string): string {
		switch (lang) {
			case "ru":
				return "Respond in Russian.";
			case "en":
				return "Respond in English.";
			case "auto":
				return "Respond in the same language as the input data, or English if unclear.";
			default:
				return "";
		}
	}

	public async run(
		input: any,
		settings: Record<string, any>,
	): Promise<Any2TextOutput | null> {
		if (input === undefined || input === null) {
			return null;
		}

		const style = settings.style || "brief";
		const customPrompt = settings.customPrompt || "";
		const maxLength = settings.maxLength || 500;
		const language = settings.language || "en";

		try {
			// Serialize input to JSON for LLM
			const inputStr =
				typeof input === "string" ? input : JSON.stringify(input, null, 2);

			// Build prompt
			let prompt: string;

			if (style === "custom" && customPrompt) {
				prompt = `${customPrompt}\n\nData:\n${inputStr}`;
			} else {
				const styleInstruction = this.getStylePrompt(style, maxLength);
				const langInstruction = this.getLanguageInstruction(language);

				prompt = `${styleInstruction} ${langInstruction}\n\nData to convert:\n${inputStr}`;
			}

			const { text } = await generateText({
				model: this.openrouter.chat(this.agentConfig.model),
				system: this.agentConfig.systemPrompt,
				prompt,
				temperature: 0.3,
				maxTokens: Math.ceil(maxLength / 3), // Rough estimate
			});

			// Trim to max length if needed
			let result = text.trim();
			if (result.length > maxLength) {
				result = `${result.slice(0, maxLength - 3)}...`;
			}

			return {
				text: result,
				timestamp: Date.now(),
			};
		} catch (err) {
			logger.error({ err, agentId: this.agentManifest.id }, "Any2Text failed");
			return null;
		}
	}
}

// Create singleton instance and register
const any2textAgent = new Any2TextAgent();
registerExportedAgent(any2textAgent);

export default any2textAgent;
