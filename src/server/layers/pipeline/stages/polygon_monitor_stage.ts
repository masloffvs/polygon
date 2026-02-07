import { logger } from "../../../utils/logger";
import type { PolygonTransferEvent } from "../../sources/polygon_monitor";
import { PipelineStage } from "../stage";
import type { ProcessingContext } from "../types";

export class PolygonMonitorStage extends PipelineStage<
	PolygonTransferEvent,
	PolygonTransferEvent
> {
	id = "polygon-monitor-stage";
	description = "Processes Polygon Topology Events";
	inputs = ["polygon-monitor-source"];
	output = "polygon-processed-events";

	public async process(
		data: PolygonTransferEvent,
		context: ProcessingContext,
	): Promise<PolygonTransferEvent | null> {
		if (context.topic !== "polygon-monitor-source") return null;

		// Filter < $5k to remove spam
		let estimatedUsd = 0;
		const sym = data.symbol.toUpperCase();

		if (sym.includes("USD") || sym.includes("DAI")) {
			estimatedUsd = data.value;
		} else if (sym.includes("ETH")) {
			estimatedUsd = data.value * 2800; // Approximate ETH Price
		} else if (sym.includes("BTC")) {
			estimatedUsd = data.value * 95000; // Approximate BTC Price
		}

		if (estimatedUsd < 5000) {
			return null;
		}

		if (estimatedUsd > 10000) {
			logger.info(
				{
					type: "polygon-whale-mvmt",
					from: data.from,
					to: data.to,
					value: data.value,
					symbol: data.symbol,
					usd: estimatedUsd,
				},
				"Large Polygon Transfer Detected",
			);
		}

		// Pass through for downstream consumers
		return data;
	}
}
