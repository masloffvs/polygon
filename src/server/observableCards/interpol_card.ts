import type { FBINotice } from "../adapters/fbi";
import type { InterpolNotice } from "../adapters/interpol";
import type { AggregatorLayer } from "../layers/aggregator";
import { ObservableCard } from "./base";

interface WantedCardState {
	red: InterpolNotice[];
	yellow: InterpolNotice[];
	un: InterpolNotice[];
	fbi: FBINotice[];
	total: number;
	lastUpdate: number;
}

interface InterpolProcessedOutput {
	red: InterpolNotice[];
	yellow: InterpolNotice[];
	un: InterpolNotice[];
	total: number;
	timestamp: number;
}

interface FBIProcessedOutput {
	fbi: FBINotice[];
	timestamp: number;
}

export class InterpolCard extends ObservableCard<
	InterpolProcessedOutput | FBIProcessedOutput,
	WantedCardState
> {
	constructor(aggregator: AggregatorLayer) {
		super(
			{
				id: "interpol-card",
				title: "Interpol & FBI Notices",
				description: "Red, Yellow, UN notices from Interpol and FBI Wanted",
				type: "list",
				inputs: ["interpol-active", "fbi-active"],
			},
			{
				red: [],
				yellow: [],
				un: [],
				fbi: [],
				total: 0,
				lastUpdate: 0,
			},
			aggregator,
		);
	}

	public process(
		data: InterpolProcessedOutput | FBIProcessedOutput,
		topic: string,
	): void {
		if (topic === "interpol-active") {
			const interpolData = data as InterpolProcessedOutput;
			this.snapshot = {
				...this.snapshot,
				red: interpolData.red,
				yellow: interpolData.yellow,
				un: interpolData.un,
				total:
					interpolData.red.length +
					interpolData.yellow.length +
					interpolData.un.length +
					this.snapshot.fbi.length,
				lastUpdate: interpolData.timestamp,
			};
		} else if (topic === "fbi-active") {
			const fbiData = data as FBIProcessedOutput;
			this.snapshot = {
				...this.snapshot,
				fbi: fbiData.fbi,
				total:
					this.snapshot.red.length +
					this.snapshot.yellow.length +
					this.snapshot.un.length +
					fbiData.fbi.length,
				lastUpdate: fbiData.timestamp,
			};
		}
	}
}
