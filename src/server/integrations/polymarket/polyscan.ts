import { logger } from "../../utils/logger";
import type { PolymarketPollingClient } from "./polling-client";
import type { Activity, Position, PositionEvent, UserInfo } from "./types";

// Typed event payloads for each event type
export interface NewPositionEvent {
	user: string;
	userInfo: UserInfo;
	positions: Position[];
	timestamp: Date;
}

export interface RemovedPositionEvent {
	user: string;
	userInfo: UserInfo;
	positions: Position[];
	timestamp: Date;
}

export interface UpdateEvent {
	user: string;
	userInfo: UserInfo;
	positions: Position[];
	timestamp: Date;
}

export interface ErrorEvent {
	user: string;
	userInfo: UserInfo;
	error: Error;
	timestamp: Date;
}

export interface ActivityEvent {
	user: string;
	userInfo: UserInfo;
	activities: Activity[];
	timestamp: Date;
}

type NewPositionCallback = (event: NewPositionEvent) => void;
type RemovedPositionCallback = (event: RemovedPositionEvent) => void;
type UpdateCallback = (event: UpdateEvent) => void;
type ErrorCallback = (event: ErrorEvent) => void;
type ActivityCallback = (event: ActivityEvent) => void;
type AnyEventCallback = (event: PositionEvent) => void | Promise<void>;

/**
 * Fluent wrapper for PolymarketPollingClient with typed event handlers
 */
export class Polyscan {
	private client: PolymarketPollingClient;
	private unsubscribe: (() => void) | null = null;

	private newPositionHandlers: NewPositionCallback[] = [];
	private removedPositionHandlers: RemovedPositionCallback[] = [];
	private updateHandlers: UpdateCallback[] = [];
	private errorHandlers: ErrorCallback[] = [];
	private activityHandlers: ActivityCallback[] = [];
	private anyHandlers: AnyEventCallback[] = [];

	constructor(client: PolymarketPollingClient) {
		this.client = client;
	}

	/**
	 * Subscribe to new position events
	 */
	onNewPosition(callback: NewPositionCallback): this {
		this.newPositionHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to removed position events
	 */
	onRemovedPosition(callback: RemovedPositionCallback): this {
		this.removedPositionHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to position update events
	 */
	onUpdate(callback: UpdateCallback): this {
		this.updateHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to error events
	 */
	onError(callback: ErrorCallback): this {
		this.errorHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to activity (trade) events
	 */
	onActivity(callback: ActivityCallback): this {
		this.activityHandlers.push(callback);
		return this;
	}

	/**
	 * Subscribe to all events (receives raw PositionEvent)
	 * Useful for custom handlers like TelegramNotifier
	 */
	onAny(callback: AnyEventCallback): this {
		this.anyHandlers.push(callback);
		return this;
	}

	/**
	 * Start monitoring and attach event handlers
	 */
	start(): this {
		// Subscribe to the underlying client
		this.unsubscribe = this.client.on((event: PositionEvent) => {
			this.handleEvent(event);
		});

		this.client.start();
		return this;
	}

	/**
	 * Stop monitoring and detach event handlers
	 */
	stop(): this {
		this.client.stop();
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		return this;
	}

	/**
	 * Get the underlying client
	 */
	getClient(): PolymarketPollingClient {
		return this.client;
	}

	/**
	 * Get all monitored users
	 */
	getUsers() {
		return this.client.getUsers();
	}

	private handleEvent(event: PositionEvent): void {
		// Call any handlers first (async-safe)
		this.anyHandlers.forEach((handler) => {
			try {
				handler(event);
			} catch (err) {
				logger.error({ err }, "Error in onAny handler");
			}
		});

		switch (event.type) {
			case "new":
				if (event.newPositions && event.newPositions.length > 0) {
					const newEvent: NewPositionEvent = {
						user: event.user,
						userInfo: event.userInfo,
						positions: event.newPositions,
						timestamp: event.timestamp,
					};
					this.newPositionHandlers.forEach((handler) => handler(newEvent));
				}
				break;

			case "removed":
				if (event.removedPositions && event.removedPositions.length > 0) {
					const removedEvent: RemovedPositionEvent = {
						user: event.user,
						userInfo: event.userInfo,
						positions: event.removedPositions,
						timestamp: event.timestamp,
					};
					this.removedPositionHandlers.forEach((handler) =>
						handler(removedEvent),
					);
				}
				break;

			case "update": {
				const updateEvent: UpdateEvent = {
					user: event.user,
					userInfo: event.userInfo,
					positions: event.positions ?? [],
					timestamp: event.timestamp,
				};
				this.updateHandlers.forEach((handler) => handler(updateEvent));
				break;
			}

			case "error":
				if (event.error) {
					const errorEvent: ErrorEvent = {
						user: event.user,
						userInfo: event.userInfo,
						error: event.error,
						timestamp: event.timestamp,
					};
					this.errorHandlers.forEach((handler) => handler(errorEvent));
				}
				break;

			case "activity":
				if (event.activities && event.activities.length > 0) {
					const activityEvent: ActivityEvent = {
						user: event.user,
						userInfo: event.userInfo,
						activities: event.activities,
						timestamp: event.timestamp,
					};
					this.activityHandlers.forEach((handler) => handler(activityEvent));
				}
				break;
		}
	}
}

/**
 * Create a fluent polyscan wrapper around a PolymarketPollingClient
 *
 * @example
 * ```ts
 * const client = createPollingClient()
 *   .interval(10_000)
 *   .addUsers([...])
 *   .build();
 *
 * polyscan(client)
 *   .onNewPosition((e) => console.log('New:', e.positions))
 *   .onRemovedPosition((e) => console.log('Removed:', e.positions))
 *   .onUpdate((e) => console.log('Update:', e.positions.length))
 *   .onError((e) => console.error('Error:', e.error))
 *   .start();
 * ```
 */
export function polyscan(client: PolymarketPollingClient): Polyscan {
	return new Polyscan(client);
}
