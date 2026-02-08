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

interface VectorStoreOutput {
  stored: boolean;
  pointId: string;
  collection: string;
  timestamp: number;
}

/**
 * Vector Store Agent
 *
 * Takes data, generates embeddings via a configurable OpenAI-compatible
 * embedding endpoint, and stores the vector + payload in Qdrant.
 *
 * Supports any embedding model accessible through LM Studio, Ollama,
 * or any OpenAI-compatible server.
 */
export class VectorStoreAgent extends ExportedAgent<any, VectorStoreOutput> {
  readonly agentManifest: ExportedAgentManifest = {
    id: "vector-store",
    name: "Vector Store",
    description: "Embeds input data and stores vectors in Qdrant collection",
    category: "AI",
    ui: {
      color: "#6366f1",
      icon: "database",
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
        name: "embeddingSize",
        type: "number",
        label: "Embedding Dimensions",
        defaultValue: 1024,
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
        name: "textField",
        type: "text",
        label: "Text field to embed (dot path or empty for full input)",
        defaultValue: "",
      },
      {
        name: "payloadFields",
        type: "text",
        label: "Payload fields to store (comma-separated, empty = all)",
        defaultValue: "",
      },
    ],
  };

  readonly agentConfig: AgentConfig = {
    provider: "lmstudio",
    model: "text-embedding-qwen3-embedding-0.6b@q8_0",
    systemPrompt: "",
  };

  readonly pipelineInputs = ["vector-store-input"];
  readonly pipelineOutput = "vector-stored";

  private qdrantClients = new Map<string, QdrantClient>();
  private embeddingClients = new Map<string, ReturnType<typeof createOpenAI>>();
  private initializedCollections = new Set<string>();

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

  private async ensureCollection(
    qdrant: QdrantClient,
    collection: string,
    embeddingSize: number,
  ) {
    const cacheKey = `${collection}:${embeddingSize}`;
    if (this.initializedCollections.has(cacheKey)) return;

    try {
      const collections = await qdrant.getCollections();
      const exists = collections.collections.find((c) => c.name === collection);

      if (!exists) {
        await qdrant.createCollection(collection, {
          vectors: { size: embeddingSize, distance: "Cosine" },
        });
        logger.info({ collection }, "Created Qdrant collection");
      }
      this.initializedCollections.add(cacheKey);
    } catch (err) {
      logger.error({ err, collection }, "Failed to ensure Qdrant collection");
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((curr, key) => curr?.[key], obj);
  }

  private extractPayload(
    input: any,
    payloadFields: string,
  ): Record<string, any> {
    if (!payloadFields.trim()) {
      // Store everything
      if (typeof input === "object" && input !== null) {
        return { ...input };
      }
      return { raw: input };
    }

    const fields = payloadFields.split(",").map((f) => f.trim());
    const payload: Record<string, any> = {};
    for (const field of fields) {
      payload[field] = this.getNestedValue(input, field);
    }
    return payload;
  }

  public async run(
    input: any,
    settings: Record<string, any>,
  ): Promise<VectorStoreOutput | null> {
    if (input === undefined || input === null) {
      return null;
    }

    const embeddingUrl =
      settings.embeddingUrl || "http://192.168.1.222:1234/v1";
    const embeddingApiKey = settings.embeddingApiKey || "lm-studio";
    const embeddingModel =
      settings.embeddingModel || "text-embedding-qwen3-embedding-0.6b@q8_0";
    const embeddingSize = settings.embeddingSize || 1024;
    const qdrantUrl = settings.qdrantUrl || "http://localhost:6333";
    const collection = settings.collection || "default_vectors";
    const textField = settings.textField || "";
    const payloadFields = settings.payloadFields || "";

    try {
      const qdrant = this.getQdrantClient(qdrantUrl);
      const embClient = this.getEmbeddingClient(embeddingUrl, embeddingApiKey);

      await this.ensureCollection(qdrant, collection, embeddingSize);

      // Determine text to embed
      let textToEmbed: string;
      if (textField) {
        const val = this.getNestedValue(input, textField);
        textToEmbed = typeof val === "string" ? val : JSON.stringify(val);
      } else {
        textToEmbed =
          typeof input === "string" ? input : JSON.stringify(input, null, 2);
      }

      // Generate embedding
      const { embedding } = await embed({
        model: embClient.embedding(embeddingModel),
        value: textToEmbed,
      });

      // Prepare payload
      const payload = {
        ...this.extractPayload(input, payloadFields),
        _embeddedText: textToEmbed.slice(0, 1000),
        _storedAt: new Date().toISOString(),
      };

      const pointId = crypto.randomUUID();

      // Store in Qdrant
      await qdrant.upsert(collection, {
        points: [{ id: pointId, vector: embedding, payload }],
      });

      logger.info(
        { agentId: this.agentManifest.id, collection, pointId },
        "Stored vector in Qdrant",
      );

      return {
        stored: true,
        pointId,
        collection,
        timestamp: Date.now(),
      };
    } catch (err) {
      logger.error(
        { err, agentId: this.agentManifest.id },
        "Vector Store failed",
      );
      return null;
    }
  }
}

// Self-register
const vectorStoreAgent = new VectorStoreAgent();
registerExportedAgent(vectorStoreAgent);

export default vectorStoreAgent;
