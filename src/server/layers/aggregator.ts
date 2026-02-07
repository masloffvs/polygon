import Emittery from "emittery";
import { Subject } from "rxjs";

interface TopicStats {
	messagesCount: number;
	bytesProcessed: number;
	lastSeen: number;
	lastEvents: any[]; // Keep last 10
}

export class AggregatorLayer {
	// Access to individual emitters
	public readonly emitters = new Map<string, Emittery>();

	// Unified RxJS observer (Aggregated stream)
	public readonly feed$ = new Subject<{ pool: string; event: any }>();

	// Stats storage
	public readonly stats = new Map<string, TopicStats>();

	constructor(initialTopics: string[] = []) {
		this.initializeEmitters(initialTopics);
	}

	public registerTopic(topic: string) {
		if (this.emitters.has(topic)) return;

		this.stats.set(topic, {
			messagesCount: 0,
			bytesProcessed: 0,
			lastSeen: 0,
			lastEvents: [],
		});

		const emitter = new Emittery();
		emitter.onAny((_, eventData) => {
			this.updateStats(topic, eventData);
			this.feed$.next({
				pool: topic,
				event: eventData,
			});
		});
		this.emitters.set(topic, emitter);
	}

	private updateStats(topic: string, data: any) {
		const stat = this.stats.get(topic);
		if (!stat) return;

		try {
			// Estimate size
			const size = JSON.stringify(data).length;
			stat.bytesProcessed += size;
			stat.messagesCount++;
			stat.lastSeen = Date.now();

			// Store sample (keep last 10)
			stat.lastEvents.unshift({ timestamp: Date.now(), data });
			if (stat.lastEvents.length > 10) {
				stat.lastEvents.pop();
			}
		} catch (_err) {
			// Ignore serialization errors for stats
		}
	}

	private initializeEmitters(ids: string[]) {
		ids.forEach((id) => this.registerTopic(id));
	}

	public getEmitter(id: string) {
		return this.emitters.get(id);
	}

	public getStats(topic: string) {
		return this.stats.get(topic);
	}

	public getAllStats() {
		return Object.fromEntries(this.stats);
	}
}
