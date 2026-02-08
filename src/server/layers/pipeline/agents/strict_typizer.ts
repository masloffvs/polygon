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

interface StrictTypizerOutput {
  data: Record<string, any>;
  valid: boolean;
  errors: string[];
  timestamp: number;
}

/**
 * Strict Typizer Agent
 *
 * Takes raw/unknown data and uses AI to extract a strictly typed object
 * matching a user-defined schema. The schema is described as key-type pairs.
 *
 * Example schema: { "price": "number", "name": "string", "active": "boolean" }
 *
 * The AI will analyze the input and attempt to return a valid JSON object
 * conforming to the specified schema, performing type coercion as needed.
 */
export class StrictTypizerAgent extends ExportedAgent<
  any,
  StrictTypizerOutput
> {
  readonly agentManifest: ExportedAgentManifest = {
    id: "strict-typizer",
    name: "Strict Typizer",
    description:
      "Extracts typed structured data from raw input using AI. Define schema as key:type pairs.",
    category: "AI",
    ui: {
      color: "#f59e0b",
      icon: "shield",
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
        label: "API Key (for custom)",
        defaultValue: "",
      },
      {
        name: "model",
        type: "text",
        label: "Model ID",
        defaultValue: "tngtech/deepseek-r1t2-chimera:free",
      },
      {
        name: "schema",
        type: "text",
        label: "Output Schema (JSON: {key: type})",
        defaultValue:
          '{"title": "string", "value": "number", "tags": "string[]"}',
      },
      {
        name: "strict",
        type: "boolean",
        label: "Strict mode (fail if can't match)",
        defaultValue: true,
      },
      {
        name: "instructions",
        type: "text",
        label: "Additional instructions",
        defaultValue: "",
      },
    ],
  };

  readonly agentConfig: AgentConfig = {
    provider: "openrouter",
    model: "tngtech/deepseek-r1t2-chimera:free",
    systemPrompt: "",
  };

  readonly pipelineInputs = ["typizer-input"];
  readonly pipelineOutput = "typizer-output";

  private defaultOpenrouter: ReturnType<typeof createOpenRouter> | null = null;

  constructor() {
    super();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      this.defaultOpenrouter = createOpenRouter({
        apiKey,
        headers: {
          "HTTP-Referer": "https://polygon-bot.com",
          "X-Title": "Polygon Bot - Strict Typizer",
        },
      });
    } else {
      logger.warn(
        { agentId: this.agentManifest.id },
        "OPENROUTER_API_KEY missing; Strict Typizer needs custom API",
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

    if (!this.defaultOpenrouter) {
      throw new Error(
        "OPENROUTER_API_KEY is not set and no custom API configured",
      );
    }
    return this.defaultOpenrouter.chat(model);
  }

  private buildSystemPrompt(schema: string, instructions: string): string {
    return [
      "You are a strict data extraction and typing engine.",
      "Your ONLY job is to convert input data into a JSON object matching the exact schema provided.",
      "",
      "RULES:",
      "1. ONLY output valid JSON. No markdown, no explanations, no text before or after.",
      "2. The output MUST match the schema exactly — correct keys and correct types.",
      "3. Perform type coercion when possible (e.g. '123' → 123 for number fields).",
      "4. If a value cannot be extracted or coerced, use null.",
      "5. For arrays (type[]), return an array of the base type.",
      "6. Never invent data — only extract from the input.",
      "",
      `OUTPUT SCHEMA: ${schema}`,
      "",
      "Types reference: string, number, int, float, boolean, string[], number[], object, any",
      instructions ? `\nAdditional instructions: ${instructions}` : "",
    ].join("\n");
  }

  private validateOutput(
    data: Record<string, any>,
    schemaStr: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const schema = JSON.parse(schemaStr);

      for (const [key, expectedType] of Object.entries(schema)) {
        const value = data[key];
        const typeStr = String(expectedType).toLowerCase();

        if (value === undefined) {
          errors.push(`Missing key: ${key}`);
          continue;
        }

        if (value === null) continue; // null is acceptable

        if (typeStr === "string" && typeof value !== "string") {
          errors.push(`${key}: expected string, got ${typeof value}`);
        } else if (
          (typeStr === "number" || typeStr === "int" || typeStr === "float") &&
          typeof value !== "number"
        ) {
          errors.push(`${key}: expected ${typeStr}, got ${typeof value}`);
        } else if (typeStr === "boolean" && typeof value !== "boolean") {
          errors.push(`${key}: expected boolean, got ${typeof value}`);
        } else if (typeStr.endsWith("[]") && !Array.isArray(value)) {
          errors.push(`${key}: expected array, got ${typeof value}`);
        } else if (
          typeStr === "object" &&
          (typeof value !== "object" || Array.isArray(value))
        ) {
          errors.push(`${key}: expected object, got ${typeof value}`);
        }
      }
    } catch {
      errors.push("Failed to parse schema for validation");
    }

    return { valid: errors.length === 0, errors };
  }

  public async run(
    input: any,
    settings: Record<string, any>,
  ): Promise<StrictTypizerOutput | null> {
    if (input === undefined || input === null) {
      return null;
    }

    const schemaStr =
      settings.schema ||
      '{"title": "string", "value": "number", "tags": "string[]"}';
    const strict = settings.strict ?? true;
    const instructions = settings.instructions || "";

    try {
      const inputStr =
        typeof input === "string" ? input : JSON.stringify(input, null, 2);

      const llmModel = this.getProvider(settings);
      const systemPrompt = this.buildSystemPrompt(schemaStr, instructions);

      const { text } = await generateText({
        model: llmModel,
        system: systemPrompt,
        prompt: `Extract and type the following data:\n\n${inputStr}`,
        temperature: 0.1,
        maxTokens: 2048,
      } as Parameters<typeof generateText>[0]);

      // Parse JSON from response
      const cleanText = text
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(cleanText);
      } catch {
        // Try to extract JSON from the response
        const match = cleanText.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          return {
            data: {},
            valid: false,
            errors: ["Failed to parse AI response as JSON"],
            timestamp: Date.now(),
          };
        }
      }

      // Validate against schema
      const validation = this.validateOutput(parsed, schemaStr);

      if (strict && !validation.valid) {
        return {
          data: parsed,
          valid: false,
          errors: validation.errors,
          timestamp: Date.now(),
        };
      }

      return {
        data: parsed,
        valid: validation.valid,
        errors: validation.errors,
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.error(
        { err, agentId: this.agentManifest.id },
        "Strict Typizer failed",
      );
      return null;
    }
  }
}

// Self-register
const strictTypizerAgent = new StrictTypizerAgent();
registerExportedAgent(strictTypizerAgent);

export default strictTypizerAgent;
