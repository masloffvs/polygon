import Redis from "ioredis";
import { logger } from "../utils/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const CHANNEL = "datastudio:triggers";

export interface TriggerEvent {
	key: string;
	payload: any;
	timestamp: number;
}

type TriggerCallback = (event: TriggerEvent) => void;

/**
 * TriggerBus - Redis Pub/Sub event bus for API Triggers
 *
 * Uses Redis Pub/Sub to broadcast incoming API requests
 * to all subscribed ApiTrigger nodes across all processes.
 */
class TriggerBus {
	private static instance: TriggerBus;

	// Publisher connection (for sending)
	private publisher: Redis | null = null;

	// Subscriber connection (for receiving - needs separate connection)
	private subscriber: Redis | null = null;

	// Local callbacks
	private callbacks: Set<TriggerCallback> = new Set();
	private initialized = false;

	private constructor() {}

	public static getInstance(): TriggerBus {
		if (!TriggerBus.instance) {
			TriggerBus.instance = new TriggerBus();
		}
		return TriggerBus.instance;
	}

	/**
	 * Initialize Redis connections
	 * Called lazily on first subscribe
	 */
	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;

		logger.info("TriggerBus: Initializing Redis Pub/Sub...");

		// Publisher for sending events
		this.publisher = new Redis(REDIS_URL, {
			retryStrategy: (times) => Math.min(times * 50, 2000),
		});

		// Subscriber needs its own connection (Redis limitation)
		this.subscriber = new Redis(REDIS_URL, {
			retryStrategy: (times) => Math.min(times * 50, 2000),
		});

		// Handle incoming messages
		this.subscriber.on("message", (channel, message) => {
			if (channel !== CHANNEL) return;

			try {
				const event: TriggerEvent = JSON.parse(message);
				logger.info(
					{ event, callbackCount: this.callbacks.size },
					"TriggerBus: Received event from Redis",
				);

				// Notify all local callbacks
				for (const callback of this.callbacks) {
					try {
						logger.info("TriggerBus: Calling callback...");
						callback(event);
					} catch (err) {
						logger.error({ err }, "TriggerBus: Callback error");
					}
				}
			} catch (err) {
				logger.error({ err, message }, "TriggerBus: Failed to parse message");
			}
		});

		// Subscribe to channel
		await this.subscriber.subscribe(CHANNEL);
		logger.info(
			{ channel: CHANNEL },
			"TriggerBus: Subscribed to Redis channel",
		);

		this.initialized = true;
	}

	/**
	 * Fire a trigger event to all listeners via Redis Pub/Sub
	 * @param key - Trigger key for filtering
	 * @param payload - Data payload
	 */
	public async fire(key: string, payload: any): Promise<void> {
		await this.ensureInitialized();

		const event: TriggerEvent = {
			key,
			payload,
			timestamp: Date.now(),
		};

		const message = JSON.stringify(event);
		await this.publisher?.publish(CHANNEL, message);

		logger.debug({ key, channel: CHANNEL }, "TriggerBus: Published event");
	}

	/**
	 * Subscribe to trigger events (async - waits for Redis connection)
	 * @param callback - Function to call on trigger
	 * @returns Unsubscribe function
	 */
	public async subscribe(callback: TriggerCallback): Promise<() => void> {
		// Wait for Redis to be ready
		await this.ensureInitialized();

		this.callbacks.add(callback);
		logger.info(
			{ callbackCount: this.callbacks.size },
			"TriggerBus: Added subscriber",
		);

		return () => {
			this.callbacks.delete(callback);
			logger.debug(
				{ callbackCount: this.callbacks.size },
				"TriggerBus: Removed subscriber",
			);
		};
	}

	/**
	 * Cleanup Redis connections
	 */
	public async dispose(): Promise<void> {
		if (this.subscriber) {
			await this.subscriber.unsubscribe(CHANNEL);
			this.subscriber.disconnect();
			this.subscriber = null;
		}
		if (this.publisher) {
			this.publisher.disconnect();
			this.publisher = null;
		}
		this.callbacks.clear();
		this.initialized = false;
		logger.info("TriggerBus: Disposed");
	}
}

export const triggerBus = TriggerBus.getInstance();
