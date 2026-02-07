// src/server/layers/pipeline/types.ts

export type Topic = string;

export interface PipelineDependencyGraph {
	nodes: {
		id: string; // Pipeline Class Name usually
		inputs: Topic[];
		output: Topic | null;
		description: string;
		type?: "stage" | "function" | "agent";
		config?: any; // Agent config
	}[];
	edges: {
		from: string; // source topic
		to: string; // pipeline id
	}[];
	stats?: Record<string, any>;
}

export interface ProcessingContext {
	timestamp: number;
	topic: Topic;
	data: any;
}
