import type { AggregatorLayer } from "../layers/aggregator";

export interface ObservableCardConfig {
	id: string;
	title: string;
	description: string;
	type: "stat" | "list" | "chart" | "resource" | "custom";
	inputs: string[];
}

export abstract class ObservableCard<InputType = any, SnapshotType = any> {
	public readonly id: string;
	public readonly title: string;
	public readonly description: string;
	public readonly type: string;
	public readonly inputs: string[];

	protected snapshot: SnapshotType;

	constructor(
		config: ObservableCardConfig,
		initialSnapshot: SnapshotType,
		protected aggregator: AggregatorLayer,
	) {
		this.id = config.id;
		this.title = config.title;
		this.description = config.description;
		this.type = config.type;
		this.inputs = config.inputs;
		this.snapshot = initialSnapshot;
	}

	/**
	 * Process incoming data to update the snapshot
	 */
	public abstract process(data: InputType, topic: string): void;

	public getSnapshot(): SnapshotType {
		return this.snapshot;
	}

	public getMetadata() {
		return {
			id: this.id,
			title: this.title,
			description: this.description,
			type: this.type,
			inputs: this.inputs,
		};
	}
}
