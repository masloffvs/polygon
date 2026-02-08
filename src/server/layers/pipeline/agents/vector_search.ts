import { createOpenAI } from "@ai-sdk/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { embed } from "ai";
import { logger } from "../../../utils/logger";
import type { AgentConfig } from "../agent";
import {
  ExportedAgent,
  type ExportedAgentManifest,
  registerExportedAgent,
} from "../exported_agent";

interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, any>;
}

interface VectorSearchOutput {
  query: string;
  results: SearchResult[];
  totalFound: number;
  collection: string;
  timestamp: number;
}

/**
 * Vector Search Agent
 *
 * Searches for similar vectors in a Qdrant collection.
 * Takes a text query, embeds it, and performs similarity search.
 */
export class VectorSearchAgent extends ExportedAgent<any, VectorSearchOutput> {
  readonly agentManifest: ExportedAgentManifest = {
    id: "vector-search",
    name: "Vector Search",
    description:
      "Searches for similar items in a Qdrant vector collection by text query",
    category: "AI",
    ui: {
      color: "#8b5cf6",
      icon: "search",
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
        name: "qdrantUrl",
        type: "text",
        label: "Qdrant URL",
        defaultValue: "http://localhost:6333",
      },
      {
        name: "collection",
        type: "text",
        label: "Collection Name",
        defaultValue: "default_vectors",
        required: true,
      },
      {
        name: "topK",
        type: "number",
        label: "Number of results (Top K)",
        defaultValue: 5,
      },
      {
        name: "scoreThreshold",
        type: "number",
        label: "Min similarity score (0-1)",
        defaultValue: 0.5,
      },
      {
        name: "queryField",
        type: "text",
        label: "Input field to use as query (dot path, empty = full input)",
        defaultValue: "",
      },
    ],
  };

  readonly agentConfig: AgentConfig = {
    provider: "lmstudio",
    model: "text-embedding-qwen3-embedding-0.6b@q8_0",
    systemPrompt: "",
  };

  readonly pipelineInputs = ["vector-search-input"];
  readonly pipelineOutput = "vector-search-results";

  private qdrantClients = new Map<string, QdrantClient>();
  private embeddingClients = new Map<string, ReturnType<typeof createOpenAI>>();

  constructor() {
    super();
  }

  private getQdrantClient(url: string): QdrantClient {
    if (!this.qdrantClients.has(url)) {
      this.qdrantClients.set(url, new QdrantClient({ url }));
    }
    return this.qdrantClients.get(url)!;
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

  public async run(
    input: any,
    settings: Record<string, any>,
  ): Promise<VectorSearchOutput | null> {
    if (input === undefined || input === null) {
      return null;
    }

    const embeddingUrl =
      settings.embeddingUrl || "http://192.168.1.222:1234/v1";
    const embeddingApiKey = settings.embeddingApiKey || "lm-studio";
    const embeddingModel =
      settings.embeddingModel || "text-embedding-qwen3-embedding-0.6b@q8_0";
    const qdrantUrl = settings.qdrantUrl || "http://localhost:6333";
    const collection = settings.collection || "default_vectors";
    const topK = settings.topK || 5;
    const scoreThreshold = settings.scoreThreshold || 0.5;
    const queryField = settings.queryField || "";

    try {
      const qdrant = this.getQdrantClient(qdrantUrl);
      const embClient = this.getEmbeddingClient(embeddingUrl, embeddingApiKey);

      // Determine query text
      let queryText: string;
      if (queryField) {
        const val = this.getNestedValue(input, queryField);
        queryText = typeof val === "string" ? val : JSON.stringify(val);
      } else {
        queryText = typeof input === "string" ? input : JSON.stringify(input);
      }

      // Embed query
      const { embedding } = await embed({
        model: embClient.embedding(embeddingModel),
        value: queryText,
      });

      // Search Qdrant
      const searchResults = await qdrant.search(collection, {
        vector: embedding,
        limit: topK,
        score_threshold: scoreThreshold,
        with_payload: true,
      });

      const results: SearchResult[] = searchResults.map((r) => ({
        id: String(r.id),
        score: r.score,
        payload: (r.payload as Record<string, any>) || {},
      }));

      return {
        query: queryText.slice(0, 200),
        results,
        totalFound: results.length,
        collection,
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.error(
        { err, agentId: this.agentManifest.id },
        "Vector Search failed",
      );
      return null;
    }
  }
}

// Self-register
const vectorSearchAgent = new VectorSearchAgent();
registerExportedAgent(vectorSearchAgent);

export default vectorSearchAgent;
