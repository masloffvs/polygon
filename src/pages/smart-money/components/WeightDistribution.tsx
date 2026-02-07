import { useMemo, useState } from "react";
import { NumericFont } from "@/ui/components";
import { SIGNAL_CONFIGS } from "../config";
import type { PredictionHistoryItem } from "../types";

const WeightDistribution = ({
	currentPhase,
	predictions,
	variant = "card",
}: {
	currentPhase: 1 | 2 | 3;
	predictions?: PredictionHistoryItem[];
	variant?: "card" | "flat";
}) => {
	const configs = Object.entries(SIGNAL_CONFIGS).map(([key, config]) => {
		const effectiveWeight =
			config.weight * config.phaseMultipliers[currentPhase];
		return {
			key,
			...config,
			effectiveWeight,
		};
	});

	const totalEffectiveWeight = configs.reduce(
		(sum, c) => sum + c.effectiveWeight,
		0,
	);

	const [startingAmount, setStartingAmount] = useState("1000");

	const pnlSeries = useMemo(() => {
		if (!predictions) return [];
		return [...predictions]
			.filter(
				(pred) =>
					typeof pred.pnl === "number" && Number.isFinite(pred.pnl),
			)
			.sort((a, b) => a.timestamp - b.timestamp)
			.map((pred) => pred.pnl as number);
	}, [predictions]);

	const baseAmount = Number(startingAmount);
	const baseValid = Number.isFinite(baseAmount) && baseAmount > 0;

	const projection = useMemo(() => {
		if (!baseValid || pnlSeries.length === 0) return null;
		let value = baseAmount;
		for (const pnl of pnlSeries) {
			value *= 1 + pnl / 100;
		}
		const net = value - baseAmount;
		const netPct = (net / baseAmount) * 100;
		return {
			value,
			net,
			netPct,
			count: pnlSeries.length,
		};
	}, [baseValid, baseAmount, pnlSeries]);

	return (
		<div
			className={`${variant === "card" ? "bg-dark-400/30 border border-dark-700 rounded-xl" : ""} p-4`}
		>
			<h3 className="text-xs font-mono font-bold text-gray-400 uppercase mb-3">
				Active Signal Weights (Phase {currentPhase})
			</h3>
			<div className="space-y-2">
				{configs
					.sort((a, b) => b.effectiveWeight - a.effectiveWeight)
					.map((config) => (
						<div key={config.key} className="flex items-center gap-2">
							<div className="w-8 text-xs font-bold text-gray-400">
								{config.label}
							</div>
							<div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
								<div
									className="h-full bg-blue-500/50"
									style={{
										width: `${(config.effectiveWeight / totalEffectiveWeight) * 100}%`,
									}}
								/>
							</div>
							<NumericFont className="w-12 text-right text-xs text-blue-400">
								{(
									(config.effectiveWeight / totalEffectiveWeight) *
									100
								).toFixed(1)}
								%
							</NumericFont>
						</div>
					))}
			</div>

			<div className="mt-4 pt-4 border-t border-dark-700">
				<div className="text-xs font-mono font-bold text-gray-400 uppercase mb-2">
					Return Calculator
				</div>
				<label className="text-[10px] text-gray-500 font-mono">
					Starting Amount
				</label>
				<input
					type="number"
					min="0"
					step="0.01"
					value={startingAmount}
					onChange={(event) => setStartingAmount(event.target.value)}
					className="mt-1 w-full bg-dark-900/50 border border-dark-700 rounded px-2 py-1 text-xs text-gray-200 font-mono focus:outline-none focus:border-gray-500"
				/>
				<div className="grid grid-cols-2 gap-2 mt-3">
					<div className="bg-dark-400/30 rounded p-2">
						<div className="text-[10px] text-gray-500">Projected</div>
						<NumericFont className="text-sm font-bold text-gray-100">
							{projection ? `$${projection.value.toFixed(2)}` : "-"}
						</NumericFont>
					</div>
					<div className="bg-dark-400/30 rounded p-2">
						<div className="text-[10px] text-gray-500">Net</div>
						<NumericFont
							className={`text-sm font-bold ${
								projection
									? projection.net >= 0
										? "text-green-400"
										: "text-red-400"
									: "text-gray-500"
							}`}
						>
							{projection
								? `${projection.net >= 0 ? "+" : ""}${projection.net.toFixed(2)}`
								: "-"}
						</NumericFont>
						<div className="text-[10px] text-gray-500">
							{projection
								? `${projection.netPct >= 0 ? "+" : ""}${projection.netPct.toFixed(2)}%`
								: "-"}
						</div>
					</div>
				</div>
				<div className="mt-2 text-[10px] text-gray-500 font-mono">
					{projection
						? `Based on ${projection.count} predictions with P&L.`
						: "No P&L history available yet."}
				</div>
			</div>
		</div>
	);
};

export default WeightDistribution;
