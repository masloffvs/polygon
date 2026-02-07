import {
	ensureTimedCollectorIndexes,
	getTimedCollectorCollection,
	type TimedCollectorDocument,
} from "../../../../storage/mongodb";
import { DataFlowNode, type ProcessingContext } from "../../../dataflow/Node";
import {
	DataPacket,
	type ErrorPacket,
	type NodeManifest,
	type UUID,
} from "../../../dataflow/types";
import manifest from "./schema.json";

/**
 * TimedCollector Node
 *
 * Collects data from various sources and stores in MongoDB.
 * Flushes data downstream based on dropInterval (1-24 hours).
 *
 * Cron service hits the API endpoint every hour, and if the current time
 * is within ±10 minutes of the target flush hour, data is sent downstream.
 */
export default class TimedCollectorNode extends DataFlowNode {
	public readonly manifest: NodeManifest = manifest as NodeManifest;
	private initialized = false;

	constructor(id: UUID, config: Record<string, any> = {}) {
		super(id, config);
		this.initializeCollection();
	}

	private async initializeCollection(): Promise<void> {
		if (this.initialized) return;

		try {
			await ensureTimedCollectorIndexes(this.getCollectionId());
			this.initialized = true;
		} catch (err) {
			console.error(
				"TimedCollector: Failed to initialize MongoDB indexes",
				err,
			);
		}
	}

	private getCollectionId(): string {
		const suffix = this.config.collectionName || "";
		return suffix ? `${this.id}_${suffix}` : this.id;
	}

	private getDropInterval(): number {
		const interval = Number(this.config.dropInterval) || 1;
		return Math.max(1, Math.min(24, interval)); // Clamp 1-24
	}

	/**
	 * Calculate day progress (0-100%) based on UTC time
	 */
	private calculateDayProgress(date: Date): number {
		const hours = date.getUTCHours();
		const minutes = date.getUTCMinutes();
		const seconds = date.getUTCSeconds();

		const totalSeconds = hours * 3600 + minutes * 60 + seconds;
		const daySeconds = 24 * 3600;

		return (totalSeconds / daySeconds) * 100;
	}

	/**
	 * Check if current hour is a flush target for the given interval
	 */
	public static isFlushTime(
		currentHour: number,
		dropInterval: number,
	): boolean {
		// dropInterval = 1 → flush every hour (0, 1, 2, ..., 23)
		// dropInterval = 2 → flush every 2 hours (0, 2, 4, ..., 22)
		// dropInterval = 6 → flush every 6 hours (0, 6, 12, 18)
		// dropInterval = 12 → flush every 12 hours (0, 12)
		// dropInterval = 24 → flush once per day (0)
		return currentHour % dropInterval === 0;
	}

	/**
	 * Check if we're within the ±10 minute window of a flush hour
	 */
	public static isWithinFlushWindow(now: Date, dropInterval: number): boolean {
		const currentHour = now.getUTCHours();
		const currentMinute = now.getUTCMinutes();

		// Check if this hour is a target hour
		if (!TimedCollectorNode.isFlushTime(currentHour, dropInterval)) {
			// Maybe we're in the -10 min window of the NEXT hour
			// e.g., it's 11:55 and dropInterval=1 means 12:00 is a target
			const nextHour = (currentHour + 1) % 24;
			if (
				currentMinute >= 50 &&
				TimedCollectorNode.isFlushTime(nextHour, dropInterval)
			) {
				return true;
			}
			return false;
		}

		// We're in a target hour, check if within first 5 minutes
		if (currentMinute <= 5) {
			return true;
		}

		return false;
	}

	/**
	 * Get the next flush targets for display
	 */
	public getNextFlushHours(): number[] {
		const interval = this.getDropInterval();
		const hours: number[] = [];
		for (let h = 0; h < 24; h++) {
			if (TimedCollectorNode.isFlushTime(h, interval)) {
				hours.push(h);
			}
		}
		return hours;
	}

	/**
	 * Process incoming data - store in MongoDB
	 */
	public async process(
		inputs: Record<string, DataPacket>,
		context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const data = inputs.data?.value;

		if (data === undefined) {
			return {};
		}

		const now = new Date();
		const sourceLabel = this.config.sourceLabel || "default";

		const doc: TimedCollectorDocument = {
			nodeId: this.id,
			data: data,
			source: sourceLabel,
			timestamp: now,
			dayProgress: this.calculateDayProgress(now),
			hourOfDay: now.getUTCHours(),
			createdAt: now,
			flushed: false,
		};

		try {
			const collection = getTimedCollectorCollection(this.getCollectionId());
			await collection.insertOne(doc);

			context.logger.info("TimedCollector: Data stored", {
				nodeId: this.id,
				source: sourceLabel,
				hourOfDay: doc.hourOfDay,
			});

			// Return current stats (not flush, just acknowledge)
			const pendingCount = await collection.countDocuments({ flushed: false });

			return {
				stats: new DataPacket({
					stored: true,
					pendingCount,
					nextFlushHours: this.getNextFlushHours(),
					dropInterval: this.getDropInterval(),
				}),
			};
		} catch (err) {
			context.logger.error("TimedCollector: Failed to store data", err);
			return {
				code: "MONGODB_ERROR",
				message: `Failed to store data: ${err}`,
				nodeId: this.id,
				traceId: context.traceId,
				timestamp: Date.now(),
				recoverable: true,
			};
		}
	}

	/**
	 * Flush pending data - called by cron API
	 * Returns the flushed data and emits downstream
	 */
	public async flush(context: ProcessingContext): Promise<{
		success: boolean;
		packetCount: number;
		batchId: string;
		message: string;
	}> {
		const now = new Date();
		const dropInterval = this.getDropInterval();

		if (!TimedCollectorNode.isWithinFlushWindow(now, dropInterval)) {
			return {
				success: false,
				packetCount: 0,
				batchId: "",
				message: `Not within flush window. Interval: ${dropInterval}h, Current: ${now.getUTCHours()}:${now.getUTCMinutes().toString().padStart(2, "0")} UTC`,
			};
		}

		const batchId = crypto.randomUUID();
		const collection = getTimedCollectorCollection(this.getCollectionId());

		try {
			// Find all unflushed documents
			const pendingDocs = await collection
				.find({ flushed: false })
				.sort({ timestamp: 1 })
				.toArray();

			if (pendingDocs.length === 0) {
				return {
					success: true,
					packetCount: 0,
					batchId,
					message: "No pending data to flush",
				};
			}

			// Mark all as flushed
			await collection.updateMany(
				{ flushed: false },
				{
					$set: {
						flushed: true,
						flushBatchId: batchId,
					},
				},
			);

			// Extract just the data payloads
			const batchData = pendingDocs.map((doc) => ({
				data: doc.data,
				source: doc.source,
				timestamp: doc.timestamp,
				dayProgress: doc.dayProgress,
			}));

			// Emit downstream
			this.emit({
				batch: new DataPacket(batchData),
				stats: new DataPacket({
					flushed: true,
					packetCount: pendingDocs.length,
					batchId,
					flushTime: now.toISOString(),
					dropInterval,
				}),
			});

			context.logger.info("TimedCollector: Flushed data", {
				nodeId: this.id,
				packetCount: pendingDocs.length,
				batchId,
			});

			return {
				success: true,
				packetCount: pendingDocs.length,
				batchId,
				message: `Flushed ${pendingDocs.length} packets`,
			};
		} catch (err) {
			context.logger.error("TimedCollector: Flush failed", err);
			return {
				success: false,
				packetCount: 0,
				batchId,
				message: `Flush error: ${err}`,
			};
		}
	}

	/**
	 * Get collection statistics for the UI
	 */
	public async getStats(): Promise<{
		pendingCount: number;
		totalCount: number;
		lastFlushBatchId: string | null;
		nextFlushHours: number[];
		dropInterval: number;
	}> {
		const collection = getTimedCollectorCollection(this.getCollectionId());

		const [pendingCount, totalCount, lastFlushed] = await Promise.all([
			collection.countDocuments({ flushed: false }),
			collection.estimatedDocumentCount(),
			collection.findOne({ flushed: true }, { sort: { timestamp: -1 } }),
		]);

		return {
			pendingCount,
			totalCount,
			lastFlushBatchId: lastFlushed?.flushBatchId || null,
			nextFlushHours: this.getNextFlushHours(),
			dropInterval: this.getDropInterval(),
		};
	}
}
