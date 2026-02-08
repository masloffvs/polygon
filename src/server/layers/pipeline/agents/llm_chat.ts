import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { logger } from "../../../utils/logger";
import type { AgentConfig } from "../agent";
import {
  ExportedAgent,
  type ExportedAgentManifest,
  registerExportedAgent,
} from "../exported_agent";

interface LLMChatOutput {
  text: string;
  model: string;
  tokensUsed?: number;
  timestamp: number;
}

/**
 * LLM Chat Agent
 *
 * Universal AI chat block compatible with any OpenAI-compatible API.
 * By default uses OpenRouter, but can be pointed at any custom endpoint
 * (LM Studio, Ollama, vLLM, text-generation-webui, etc.)
 *
 * Takes text input → sends to LLM with system prompt → returns text output.
 */
export class LLMChatAgent extends ExportedAgent<any, LLMChatOutput> {
  readonly agentManifest: ExportedAgentManifest = {
    id: "llm-chat",
    name: "LLM Chat",
    description:
      "Universal AI text processing block. OpenAI-compatible API support.",
    category: "AI",
    ui: {
      color: "#10b981",
      icon: "brain",
    },
    settings: [
      {
        name: "provider",
        type: "select",
        label: "Provider",
        defaultValue: "openrouter",
        options: [
          { label: "OpenRouter (default)", value: "openrouter" },
          { label: "Custom OpenAI-compatible", value: "custom" },
        ],
      },
      {
        name: "apiUrl",
        type: "text",
        label: "API Base URL (for custom)",
        defaultValue: "",
      },
      {
        name: "apiKey",
        type: "text",
        label: "API Key (for custom, leave empty for env)",
        defaultValue: "",
      },
      {
        name: "model",
        type: "text",
        label: "Model ID",
        defaultValue: "tngtech/deepseek-r1t2-chimera:free",
      },
      {
        name: "systemPrompt",
        type: "text",
        label: "System Prompt",
        defaultValue:
          "You are a helpful assistant. Process the input and respond concisely.",
      },
      {
        name: "temperature",
        type: "number",
        label: "Temperature",
        defaultValue: 0.7,
      },
      {
        name: "maxTokens",
        type: "number",
        label: "Max Tokens",
        defaultValue: 1024,
      },
    ],
  };

  readonly agentConfig: AgentConfig = {
    provider: "openrouter",
    model: "tngtech/deepseek-r1t2-chimera:free",
    systemPrompt: "You are a helpful assistant.",
  };

  readonly pipelineInputs = ["llm-chat-input"];
  readonly pipelineOutput = "llm-chat-output";

  private defaultOpenrouter: ReturnType<typeof createOpenRouter> | null = null;

  constructor() {
    super();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.defaultOpenrouter = createOpenRouter({
        apiKey,
        headers: {
          "HTTP-Referer": "https://polygon-bot.com",
          "X-Title": "Polygon Bot - LLM Chat",
        },
      });
    } else {
      logger.warn(
        { agentId: this.agentManifest.id },
        "OPENROUTER_API_KEY missing; LLM Chat will only work with custom API",
      );
    }
  }

  private getProvider(settings: Record<string, any>) {
    const provider = settings.provider || "openrouter";
    const model = settings.model || this.agentConfig.model;

    if (provider === "custom" && settings.apiUrl) {
      const customClient = createOpenAI({
        baseURL: settings.apiUrl,
        apiKey: settings.apiKey || "no-key",
      });
      return customClient.chat(model);
    }

    // Default: OpenRouter
    if (!this.defaultOpenrouter) {
      throw new Error(
        "OPENROUTER_API_KEY is not set and no custom API configured",
      );
    }
    return this.defaultOpenrouter.chat(model);
  }

  public async run(
    input: any,
    settings: Record<string, any>,
  ): Promise<LLMChatOutput | null> {
    if (input === undefined || input === null) {
      return null;
    }

    const systemPrompt =
      settings.systemPrompt || this.agentConfig.systemPrompt || "";
    const temperature = settings.temperature ?? 0.7;
    const maxTokens = settings.maxTokens || 1024;
    const model = settings.model || this.agentConfig.model;

    try {
      const inputStr =
        typeof input === "string" ? input : JSON.stringify(input, null, 2);

      const llmModel = this.getProvider(settings);

      const { text, usage } = await generateText({
        model: llmModel,
        system: systemPrompt,
        prompt: inputStr,
        temperature,
        maxTokens,
      } as Parameters<typeof generateText>[0]);

      return {
        text: text.trim(),
        model,
        tokensUsed: usage?.totalTokens,
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.error({ err, agentId: this.agentManifest.id }, "LLM Chat failed");
      return null;
    }
  }
}

// Self-register
const llmChatAgent = new LLMChatAgent();
registerExportedAgent(llmChatAgent);

export default llmChatAgent;
