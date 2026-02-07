import { type Collection, type Db, type Document, MongoClient } from "mongodb";
import { logger } from "../../server/utils/logger";

const MONGODB_URL =
	process.env.MONGODB_URL || "mongodb://localhost:27017/polygon";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Initialize MongoDB connection
 */
export async function initMongoDB(): Promise<Db> {
	if (db) return db;

	try {
		client = new MongoClient(MONGODB_URL);
		await client.connect();
		db = client.db();

		logger.info({ url: MONGODB_URL }, "MongoDB connected");

		// Create indexes for timed_collector collections
		await ensureIndexes();

		return db;
	} catch (err) {
		logger.error({ err, url: MONGODB_URL }, "Failed to connect to MongoDB");
		throw err;
	}
}

/**
 * Get MongoDB database instance
 */
export function getMongoDB(): Db {
	if (!db) {
		throw new Error("MongoDB not initialized. Call initMongoDB() first.");
	}
	return db;
}

/**
 * Get a collection by name
 */
export function getCollection<T extends Document = Document>(
	name: string,
): Collection<T> {
	return getMongoDB().collection<T>(name);
}

/**
 * Get the TimedCollector collection for a specific node
 */
export function getTimedCollectorCollection(
	nodeId: string,
): Collection<TimedCollectorDocument> {
	return getCollection<TimedCollectorDocument>(`timed_collector_${nodeId}`);
}

/**
 * Document structure for TimedCollector
 */
export interface TimedCollectorDocument {
	_id?: any;
	nodeId: string;
	data: any;
	source: string; // Which input port sent this
	timestamp: Date;
	dayProgress: number; // 0-100%, how much of the day has passed (UTC)
	hourOfDay: number; // 0-23 UTC
	createdAt: Date;
	flushed: boolean; // Has this been sent downstream?
	flushBatchId?: string; // ID of the flush batch this was sent in
}

/**
 * Ensure proper indexes exist
 */
async function ensureIndexes(): Promise<void> {
	// We'll create indexes dynamically when collections are created
	logger.info("MongoDB indexes ready");
}

/**
 * Create indexes for a specific TimedCollector node
 */
export async function ensureTimedCollectorIndexes(
	nodeId: string,
): Promise<void> {
	const collection = getTimedCollectorCollection(nodeId);

	await collection.createIndex({ timestamp: -1 });
	await collection.createIndex({ flushed: 1, timestamp: -1 });
	await collection.createIndex({ hourOfDay: 1 });
	await collection.createIndex(
		{ createdAt: 1 },
		{ expireAfterSeconds: 7 * 24 * 60 * 60 },
	); // TTL: 7 days
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB(): Promise<void> {
	if (client) {
		await client.close();
		client = null;
		db = null;
		logger.info("MongoDB connection closed");
	}
}
