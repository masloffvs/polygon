import { logger } from "../../../utils/logger";
import type { AgentConfig } from "../agent";
import {
  ExportedAgent,
  type ExportedAgentManifest,
  registerExportedAgent,
} from "../exported_agent";

interface ReplicateOutput {
  output: any;
  model: string;
  status: string;
  predictionId: string;
  processingTime: number;
  timestamp: number;
}

/**
 * Replicate API Agent
 *
 * Runs AI models via the Replicate API (https://replicate.com).
 * Supports image generation, audio, video, LLMs, and any model on Replicate.
 *
 * The API token is specified per-block in settings.
 * Model format: "owner/model" or "owner/model:version"
 */
export class ReplicateAgent extends ExportedAgent<any, ReplicateOutput> {
  readonly agentManifest: ExportedAgentManifest = {
    id: "replicate",
    name: "Replicate",
    description:
      "Run any AI model via Replicate API — images, audio, video, LLMs",
    category: "AI",
    ui: {
      color: "#ef4444",
      icon: "flame",
    },
    settings: [
      {
        name: "apiToken",
        type: "text",
        label: "Replicate API Token",
        defaultValue: "",
        required: true,
      },
      {
        name: "model",
        type: "text",
        label: "Model (owner/model or owner/model:version)",
        defaultValue: "stability-ai/sdxl",
      },
      {
        name: "inputMapping",
        type: "text",
        label: "Input mapping (JSON: {model_param: input_field})",
        defaultValue: '{"prompt": "text"}',
      },
      {
        name: "waitForResult",
        type: "boolean",
        label: "Wait for prediction to complete",
        defaultValue: true,
      },
      {
        name: "pollIntervalMs",
        type: "number",
        label: "Poll interval (ms)",
        defaultValue: 2000,
      },
      {
        name: "timeoutMs",
        type: "number",
        label: "Timeout (ms)",
        defaultValue: 300000,
      },
      {
        name: "extraInput",
        type: "text",
        label: "Extra model inputs (JSON)",
        defaultValue: "{}",
      },
    ],
  };

  readonly agentConfig: AgentConfig = {
    provider: "replicate",
    model: "stability-ai/sdxl",
    systemPrompt: "",
  };

  readonly pipelineInputs = ["replicate-input"];
  readonly pipelineOutput = "replicate-output";

  private static readonly BASE_URL = "https://api.replicate.com/v1";

  constructor() {
    super();
  }

  private buildInput(
    rawInput: any,
    inputMapping: string,
    extraInput: string,
  ): Record<string, any> {
    const result: Record<string, any> = {};

    // Parse extra inputs
    try {
      const extra = JSON.parse(extraInput || "{}");
      Object.assign(result, extra);
    } catch {
      // ignore parse errors
    }

    // Apply input mapping
    try {
      const mapping = JSON.parse(inputMapping || "{}");
      for (const [modelParam, inputField] of Object.entries(mapping)) {
        const field = String(inputField);
        let value: any;

        if (typeof rawInput === "object" && rawInput !== null) {
          value = field
            .split(".")
            .reduce((curr: any, key: string) => curr?.[key], rawInput);
        } else if (
          field === "text" ||
          field === "prompt" ||
          field === "input"
        ) {
          value = rawInput;
        }

        if (value !== undefined) {
          result[modelParam] = value;
        }
      }
    } catch {
      // Fallback: pass raw input as prompt
      if (typeof rawInput === "string") {
        result.prompt = rawInput;
      } else if (typeof rawInput === "object" && rawInput !== null) {
        Object.assign(result, rawInput);
      }
    }

    return result;
  }

  private async createPrediction(
    apiToken: string,
    model: string,
    input: Record<string, any>,
  ): Promise<{
    id: string;
    status: string;
    output: any;
    urls: { get: string };
  }> {
    // Determine if version is specified
    let body: any;

    if (model.includes(":")) {
      // owner/model:version
      const version = model.split(":")[1];
      body = { version, input };
    } else {
      // owner/model — use latest via model endpoint
      body = { input };
    }

    const url = model.includes(":")
      ? `${ReplicateAgent.BASE_URL}/predictions`
      : `${ReplicateAgent.BASE_URL}/models/${model}/predictions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Prefer: "wait", // Try to get result immediately
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Replicate API error ${res.status}: ${errText}`);
    }

    return res.json();
  }

  private async pollPrediction(
    apiToken: string,
    predictionUrl: string,
    pollInterval: number,
    timeout: number,
  ): Promise<{ status: string; output: any }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const res = await fetch(predictionUrl, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      if (!res.ok) {
        throw new Error(`Replicate poll error: ${res.status}`);
      }

      const data = await res.json();

      if (data.status === "succeeded") {
        return { status: "succeeded", output: data.output };
      }

      if (data.status === "failed" || data.status === "canceled") {
        throw new Error(
          `Prediction ${data.status}: ${data.error || "unknown error"}`,
        );
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Prediction timed out after ${timeout}ms`);
  }

  public async run(
    input: any,
    settings: Record<string, any>,
  ): Promise<ReplicateOutput | null> {
    if (input === undefined || input === null) {
      return null;
    }

    const apiToken = settings.apiToken || process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      logger.error(
        { agentId: this.agentManifest.id },
        "Replicate API token is required",
      );
      return null;
    }

    const model = settings.model || "stability-ai/sdxl";
    const inputMapping = settings.inputMapping || '{"prompt": "text"}';
    const waitForResult = settings.waitForResult ?? true;
    const pollIntervalMs = settings.pollIntervalMs || 2000;
    const timeoutMs = settings.timeoutMs || 300000;
    const extraInput = settings.extraInput || "{}";

    const startTime = Date.now();

    try {
      const modelInput = this.buildInput(input, inputMapping, extraInput);

      logger.info(
        {
          agentId: this.agentManifest.id,
          model,
          inputKeys: Object.keys(modelInput),
        },
        "Creating Replicate prediction",
      );

      const prediction = await this.createPrediction(
        apiToken,
        model,
        modelInput,
      );

      // If prediction already completed (Prefer: wait worked)
      if (prediction.status === "succeeded" || prediction.output !== null) {
        return {
          output: prediction.output,
          model,
          status: "succeeded",
          predictionId: prediction.id,
          processingTime: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      if (!waitForResult) {
        return {
          output: null,
          model,
          status: prediction.status,
          predictionId: prediction.id,
          processingTime: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      // Poll for result
      const result = await this.pollPrediction(
        apiToken,
        prediction.urls.get,
        pollIntervalMs,
        timeoutMs,
      );

      return {
        output: result.output,
        model,
        status: result.status,
        predictionId: prediction.id,
        processingTime: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.error({ err, agentId: this.agentManifest.id }, "Replicate failed");
      return null;
    }
  }
}

// Self-register
const replicateAgent = new ReplicateAgent();
registerExportedAgent(replicateAgent);

export default replicateAgent;
