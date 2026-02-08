import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { logger } from "../../../utils/logger";
import type { AgentConfig } from "../agent";
import {
  ExportedAgent,
  type ExportedAgentManifest,
  registerExportedAgent,
} from "../exported_agent";

interface EmbeddingCompareOutput {
  similarity: number;
  distance: number;
  verdict:
    | "identical"
    | "very_similar"
    | "similar"
    | "related"
    | "different"
    | "unrelated";
  embeddingA: number[];
  embeddingB: number[];
  timestamp: number;
}

/**
 * Embedding Compare Agent
 *
 * Compares two pieces of data by generating embeddings and computing
 * cosine similarity. Useful for:
 * - Duplicate detection
 * - Semantic similarity measurement
 * - Content matching
 * - Relevance scoring
 */
export class EmbeddingCompareAgent extends ExportedAgent<
  any,
  EmbeddingCompareOutput
> {
  readonly agentManifest: ExportedAgentManifest = {
    id: "embedding-compare",
    name: "Embedding Compare",
    description:
      "Compares two inputs by embedding similarity (cosine distance)",
    category: "AI",
    ui: {
      color: "#ec4899",
      icon: "git-compare",
    },
    settings: [
      {
        name: "embeddingUrl",
        type: "text",
        label: "Embedding API URL",
        defaultValue: "http://192.168.1.222:1234/v1",
      },
      {
        name: "embeddingApiKey",
        type: "text",
        label: "Embedding API Key",
        defaultValue: "lm-studio",
      },
      {
        name: "embeddingModel",
        type: "text",
        label: "Embedding Model",
        defaultValue: "text-embedding-qwen3-embedding-0.6b@q8_0",
      },
      {
        name: "fieldA",
        type: "text",
        label: "Field A (dot path in input, e.g. 'a' or 'data.text')",
        defaultValue: "a",
      },
      {
        name: "fieldB",
        type: "text",
        label: "Field B (dot path in input, e.g. 'b' or 'data.reference')",
        defaultValue: "b",
      },
      {
        name: "includeVectors",
        type: "boolean",
        label: "Include raw vectors in output",
        defaultValue: false,
      },
    ],
  };

  readonly agentConfig: AgentConfig = {
    provider: "lmstudio",
    model: "text-embedding-qwen3-embedding-0.6b@q8_0",
    systemPrompt: "",
  };

  readonly pipelineInputs = ["embedding-compare-input"];
  readonly pipelineOutput = "embedding-compare-result";

  private embeddingClients = new Map<string, ReturnType<typeof createOpenAI>>();

  constructor() {
    super();
  }

  private getEmbeddingClient(
    url: string,
    apiKey: string,
  ): ReturnType<typeof createOpenAI> {
    const key = `${url}::${apiKey}`;
    if (!this.embeddingClients.has(key)) {
      this.embeddingClients.set(
        key,
        createOpenAI({ baseURL: url, apiKey: apiKey || "no-key" }),
      );
    }
    return this.embeddingClients.get(key)!;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((curr, key) => curr?.[key], obj);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  private getVerdict(
    similarity: number,
  ):
    | "identical"
    | "very_similar"
    | "similar"
    | "related"
    | "different"
    | "unrelated" {
    if (similarity >= 0.98) return "identical";
    if (similarity >= 0.9) return "very_similar";
    if (similarity >= 0.75) return "similar";
    if (similarity >= 0.5) return "related";
    if (similarity >= 0.3) return "different";
    return "unrelated";
  }

  public async run(
    input: any,
    settings: Record<string, any>,
  ): Promise<EmbeddingCompareOutput | null> {
    if (input === undefined || input === null) {
      return null;
    }

    const embeddingUrl =
      settings.embeddingUrl || "http://192.168.1.222:1234/v1";
    const embeddingApiKey = settings.embeddingApiKey || "lm-studio";
    const embeddingModel =
      settings.embeddingModel || "text-embedding-qwen3-embedding-0.6b@q8_0";
    const fieldA = settings.fieldA || "a";
    const fieldB = settings.fieldB || "b";
    const includeVectors = settings.includeVectors ?? false;

    try {
      const embClient = this.getEmbeddingClient(embeddingUrl, embeddingApiKey);

      // Get values to compare
      let valA: any;
      let valB: any;

      if (typeof input === "object" && input !== null) {
        valA = this.getNestedValue(input, fieldA);
        valB = this.getNestedValue(input, fieldB);
      } else {
        return null; // Need object input with two fields
      }

      if (valA === undefined || valB === undefined) {
        logger.warn(
          { agentId: this.agentManifest.id, fieldA, fieldB },
          "Missing fields for comparison",
        );
        return null;
      }

      const textA = typeof valA === "string" ? valA : JSON.stringify(valA);
      const textB = typeof valB === "string" ? valB : JSON.stringify(valB);

      // Generate embeddings for both
      const [resultA, resultB] = await Promise.all([
        embed({
          model: embClient.embedding(embeddingModel),
          value: textA,
        }),
        embed({
          model: embClient.embedding(embeddingModel),
          value: textB,
        }),
      ]);

      const similarity = this.cosineSimilarity(
        resultA.embedding,
        resultB.embedding,
      );
      const distance = 1 - similarity;

      return {
        similarity: Math.round(similarity * 10000) / 10000,
        distance: Math.round(distance * 10000) / 10000,
        verdict: this.getVerdict(similarity),
        embeddingA: includeVectors ? resultA.embedding : [],
        embeddingB: includeVectors ? resultB.embedding : [],
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.error(
        { err, agentId: this.agentManifest.id },
        "Embedding Compare failed",
      );
      return null;
    }
  }
}

// Self-register
const embeddingCompareAgent = new EmbeddingCompareAgent();
registerExportedAgent(embeddingCompareAgent);

export default embeddingCompareAgent;
