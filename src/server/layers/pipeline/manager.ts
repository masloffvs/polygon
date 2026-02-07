import { logger } from "../../utils/logger";
import type { AggregatorLayer } from "../aggregator";
import { PipelineAgent } from "./agent";
import { PipelineFunction } from "./function";
import { PipelineStage } from "./stage";
import type { PipelineDependencyGraph, Topic } from "./types";

export class PipelineManager {
	private stages = new Map<string, PipelineStage>();
	private functions = new Map<string, PipelineFunction>();
	private topicSubscribers = new Map<
		Topic,
		(PipelineStage | PipelineFunction)[]
	>();

	constructor(private aggregator: AggregatorLayer) {}

	public register(unit: PipelineStage | PipelineFunction) {
		if (unit instanceof PipelineStage) {
			this.registerStage(unit);
		} else if (unit instanceof PipelineFunction) {
			this.registerFunction(unit);
		}
	}

	private registerStage(stage: PipelineStage) {
		if (this.stages.has(stage.id)) {
			logger.warn(
				{ stage: stage.id },
				"Pipeline stage already registered, overwriting",
			);
		}
		this.stages.set(stage.id, stage);
		this.aggregator.registerTopic(stage.output);
		this.mapInputs(stage);
		logger.info(
			{ stage: stage.id, inputs: stage.inputs, output: stage.output },
			"Pipeline stage registered",
		);
	}

	private registerFunction(func: PipelineFunction) {
		if (this.functions.has(func.id)) {
			logger.warn(
				{ function: func.id },
				"Pipeline function already registered, overwriting",
			);
		}
		this.functions.set(func.id, func);
		this.mapInputs(func);
		logger.info(
			{ function: func.id, inputs: func.inputs },
			"Pipeline function registered",
		);
	}

	private mapInputs(unit: PipelineStage | PipelineFunction) {
		unit.inputs.forEach((topic) => {
			if (!this.topicSubscribers.has(topic)) {
				this.topicSubscribers.set(topic, []);
			}
			this.topicSubscribers.get(topic)?.push(unit);
		});
	}

	public start() {
		logger.info("Starting Pipeline Layer...");

		this.aggregator.feed$.subscribe(async ({ pool, event }) => {
			const subscribers = this.topicSubscribers.get(pool);
			if (!subscribers) return;

			for (const unit of subscribers) {
				try {
					const payload = event.data !== undefined ? event.data : event;
					const context = {
						topic: pool,
						timestamp: Date.now(),
						data: payload,
					};

					if (unit instanceof PipelineStage) {
						const result = await unit.process(payload, context);
						if (result !== null) {
							const emitter = this.aggregator.getEmitter(unit.output);
							if (emitter) {
								emitter.emit("data", {
									source: unit.id,
									timestamp: Date.now(),
									data: result,
								});
							}
						}
					} else if (unit instanceof PipelineFunction) {
						await unit.execute(payload, context);
					}
				} catch (err) {
					logger.error(
						{ unit: unit.id, error: err },
						"Pipeline unit processing failed",
					);
				}
			}
		});
	}

	public getGraph(): PipelineDependencyGraph {
		const stageNodes = Array.from(this.stages.values()).map((stage) => {
			const isAgent = stage instanceof PipelineAgent;
			return {
				id: stage.id,
				inputs: stage.inputs,
				output: stage.output,
				description: stage.description,
				type: isAgent ? ("agent" as const) : ("stage" as const),
				config: isAgent ? (stage as PipelineAgent).agentConfig : undefined,
			};
		});

		const functionNodes = Array.from(this.functions.values()).map((func) => ({
			id: func.id,
			inputs: func.inputs,
			output: null,
			description: func.description,
			type: "function" as const,
		}));

		const nodes = [...stageNodes, ...functionNodes];

		const edges: { from: string; to: string }[] = [];
		nodes.forEach((node) => {
			node.inputs.forEach((input) => {
				edges.push({ from: input, to: node.id });
			});
		});

		return { nodes, edges, stats: this.aggregator.getAllStats() };
	}
}
