import { createOpenAI } from "@ai-sdk/openai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { embedMany } from "ai";
import { logger } from "../../../utils/logger";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface BlueSkyPost {
	uri: string;
	cid: string;
	author: {
		did: string;
		handle: string;
		displayName?: string;
		avatar?: string;
	};
	record: {
		text: string;
		createdAt: string;
		langs?: string[];
	};
	likeCount?: number;
	repostCount?: number;
	replyCount?: number;
	quoteCount?: number;
	indexedAt: string;
}

interface BlueSkyFeedEvent {
	type: "feed";
	feed: Array<{ post: BlueSkyPost }>;
	uri: string;
	timestamp: number;
}

interface VectorizerResult {
	stored: number;
	feedUri: string;
}

// ------------------------------------------------------------------
// Stage
// ------------------------------------------------------------------

export class BlueSkyVectorizerStage extends PipelineStage<
	BlueSkyFeedEvent,
	VectorizerResult
> {
	id = "bluesky-vectorizer";
	description = "Vectorizes BlueSky posts and stores in Qdrant";
	inputs = ["bluesky-feed-source"];
	output = "bluesky-vectors-stored";

	private qdrant: QdrantClient;
	private lmstudio: ReturnType<typeof createOpenAI>;
	private readonly COLLECTION_NAME = "bluesky_posts";
	private readonly EMBEDDING_SIZE = 1024; // Qwen3 embedding size
	private readonly BATCH_SIZE = 20; // Embed in batches
	private initialized = false;

	// Deduplication: track recently processed post URIs
	private processedUris = new Set<string>();
	private readonly MAX_CACHE_SIZE = 10000;

	constructor() {
		super();
		const qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
		this.qdrant = new QdrantClient({ url: qdrantUrl });

		// Local LM Studio server (OpenAI-compatible)
		const lmstudioUrl =
			process.env.LMSTUDIO_URL || "http://192.168.1.222:1234/v1";

		this.lmstudio = createOpenAI({
			baseURL: lmstudioUrl,
			apiKey: "lm-studio",
		});
	}

	private async ensureCollection() {
		if (this.initialized) return;

		try {
			const collections = await this.qdrant.getCollections();
			const exists = collections.collections.find(
				(c) => c.name === this.COLLECTION_NAME,
			);

			if (!exists) {
				await this.qdrant.createCollection(this.COLLECTION_NAME, {
					vectors: {
						size: this.EMBEDDING_SIZE,
						distance: "Cosine",
					},
				});
				logger.info(
					{ collection: this.COLLECTION_NAME },
					"Created Qdrant collection for BlueSky posts",
				);
			}
			this.initialized = true;
		} catch (err) {
			logger.error({ err }, "Failed to ensure Qdrant collection");
		}
	}

	public async process(
		data: BlueSkyFeedEvent,
		context: ProcessingContext,
	): Promise<VectorizerResult | null> {
		if (context.topic !== "bluesky-feed-source") return null;
		if (data.type !== "feed" || !data.feed || data.feed.length === 0) {
			return null;
		}

		await this.ensureCollection();

		try {
			// Filter out already processed posts and posts without text
			const newPosts = data.feed
				.map((item) => item.post)
				.filter((post) => {
					if (!post.record?.text || post.record.text.trim().length < 10) {
						return false; // Skip empty or very short posts
					}
					if (this.processedUris.has(post.uri)) {
						return false; // Already processed
					}
					return true;
				});

			if (newPosts.length === 0) {
				return null; // Nothing new to process
			}

			logger.info(
				{ stage: this.id, count: newPosts.length, feedUri: data.uri },
				"Vectorizing BlueSky posts",
			);

			// Process in batches
			let totalStored = 0;

			for (let i = 0; i < newPosts.length; i += this.BATCH_SIZE) {
				const batch = newPosts.slice(i, i + this.BATCH_SIZE);
				const stored = await this.processBatch(batch, data.uri);
				totalStored += stored;
			}

			return {
				stored: totalStored,
				feedUri: data.uri,
			};
		} catch (err) {
			logger.error(
				{ err, feedUri: data.uri },
				"Failed to vectorize BlueSky posts",
			);
			return null;
		}
	}

	private async processBatch(
		posts: BlueSkyPost[],
		feedUri: string,
	): Promise<number> {
		// Prepare texts for embedding
		const textsToEmbed = posts.map((post) => {
			// Include author info for context
			const authorInfo = post.author.displayName || post.author.handle;
			return `${authorInfo}: ${post.record.text}`;
		});

		// Embed batch
		const { embeddings } = await embedMany({
			model: this.lmstudio.embedding(
				"text-embedding-qwen3-embedding-0.6b@q8_0",
			),
			values: textsToEmbed,
		});

		// Prepare points for Qdrant
		const points = posts.map((post, idx) => {
			// Calculate engagement score
			const engagement =
				(post.likeCount || 0) +
				(post.repostCount || 0) * 2 +
				(post.replyCount || 0) * 1.5 +
				(post.quoteCount || 0) * 3;

			// Get embedding as number array
			const vector = embeddings[idx] as number[];

			return {
				id: this.generatePointId(post.uri),
				vector: vector,
				payload: {
					uri: post.uri,
					cid: post.cid,
					text: post.record.text,
					authorDid: post.author.did,
					authorHandle: post.author.handle,
					authorName: post.author.displayName || post.author.handle,
					createdAt: post.record.createdAt,
					indexedAt: post.indexedAt,
					likeCount: post.likeCount || 0,
					repostCount: post.repostCount || 0,
					replyCount: post.replyCount || 0,
					quoteCount: post.quoteCount || 0,
					engagement: engagement,
					feedUri: feedUri,
					langs: post.record.langs || [],
					storedAt: new Date().toISOString(),
				},
			};
		});

		// Upsert to Qdrant
		await this.qdrant.upsert(this.COLLECTION_NAME, {
			points: points,
		});

		// Mark as processed
		posts.forEach((post) => {
			this.processedUris.add(post.uri);
		});

		// Cleanup cache if too large
		if (this.processedUris.size > this.MAX_CACHE_SIZE) {
			const toDelete = this.processedUris.size - this.MAX_CACHE_SIZE / 2;
			const iterator = this.processedUris.values();
			for (let i = 0; i < toDelete; i++) {
				this.processedUris.delete(iterator.next().value!);
			}
		}

		return points.length;
	}

	private generatePointId(uri: string): string {
		// Generate a deterministic UUID-like ID from the post URI
		// Using simple hash approach
		let hash = 0;
		for (let i = 0; i < uri.length; i++) {
			const char = uri.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		// Convert to positive hex string and pad
		const hex = Math.abs(hash).toString(16).padStart(8, "0");
		return `${hex}-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(0, 4)}-${hex}${hex.slice(0, 4)}`;
	}
}
