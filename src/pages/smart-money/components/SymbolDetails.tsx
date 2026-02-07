import {
	Brain,
	Calendar,
	Target,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import useSWR from "swr";
import { NumericFont } from "@/ui/components";
import { SIGNAL_CONFIGS } from "../config";
import type { RealTimeState, SymbolHistoryData, SymbolState } from "../types";
import { ConfidenceMeter, SignalDetailRow } from "./Shared";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SymbolDetails = ({
	symbol,
	state,
	currentPhase,
	threshold,
	variant = "card",
	historyData: historyOverride,
}: {
	symbol: SymbolState;
	state: RealTimeState;
	currentPhase: 1 | 2 | 3;
	threshold: number;
	variant?: "card" | "flat";
	historyData?: SymbolHistoryData | null;
}) => {
	const shouldFetchHistory = Boolean(symbol && historyOverride === undefined);
	const { data: fetchedHistory } = useSWR<SymbolHistoryData>(
		shouldFetchHistory
			? `/api/predictions/symbol-history/${symbol.symbol}`
			: null,
		fetcher,
	);
	const historyData = historyOverride ?? fetchedHistory;

	const pnlValues = historyData?.predictions
		? historyData.predictions
				.map((pred) => pred.pnl)
				.filter(
					(pnl): pnl is number =>
						typeof pnl === "number" && Number.isFinite(pnl),
				)
		: [];

	const bestPnl = pnlValues.length > 0 ? Math.max(...pnlValues) : null;
	const worstPnl = pnlValues.length > 0 ? Math.min(...pnlValues) : null;
	const netPnl =
		pnlValues.length > 0 ? pnlValues.reduce((sum, pnl) => sum + pnl, 0) : null;

	if (!symbol) {
		return (
			<div
				className={`${variant === "card" ? "bg-dark-400/30 border border-dark-700 rounded-xl" : ""} w-full h-full flex flex-col items-center justify-center p-8 text-gray-500`}
			>
				<Target size={48} className="mb-4 opacity-50" />
				<p className="text-sm font-mono text-center">
					Select a symbol from the cluster or list to view detailed analysis.
				</p>
			</div>
		);
	}

	return (
		<div
			className={`${variant === "card" ? "bg-dark-400/30 border border-dark-700 rounded-xl" : ""} w-full h-full overflow-hidden flex flex-col`}
		>
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b border-dark-700 bg-dark-400/30">
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<Target className="text-blue-400" size={24} />
						<span className="text-xl font-bold text-gray-100">
							{symbol.symbol}
						</span>
					</div>
					<div
						className={`px-3 py-1 rounded-full text-sm font-bold ${
							symbol.potentialDirection === "UP"
								? "bg-green-500/20 text-green-400"
								: symbol.potentialDirection === "DOWN"
									? "bg-red-500/20 text-red-400"
									: "bg-dark-600/20 text-gray-500"
						}`}
					>
						{symbol.potentialDirection === "UP" ? (
							<TrendingUp size={14} className="inline mr-1" />
						) : (
							<TrendingDown size={14} className="inline mr-1" />
						)}
						{symbol.potentialDirection}
					</div>
					{symbol.alreadyPredicted && (
						<span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
							✓ PREDICTED THIS WINDOW
						</span>
					)}
				</div>
			</div>

			<div className="overflow-y-auto flex-1 custom-scrollbar">
				{/* Current Status */}
				<div className="p-4 border-b border-dark-700">
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<div className="bg-dark-400/30 rounded p-3">
							<div className="text-[10px] text-gray-500 mb-1">Open Price</div>
							<NumericFont className="text-lg text-gray-400">
								${symbol.openPrice.toLocaleString()}
							</NumericFont>
						</div>
						<div className="bg-dark-400/30 rounded p-3">
							<div className="text-[10px] text-gray-500 mb-1">
								Current Price
							</div>
							<NumericFont className="text-lg text-gray-100">
								${symbol.currentPrice.toLocaleString()}
							</NumericFont>
						</div>
						<div className="bg-dark-400/30 rounded p-3">
							<div className="text-[10px] text-gray-500 mb-1">Change</div>
							<NumericFont
								className={`text-lg ${symbol.priceChange > 0 ? "text-green-400" : "text-red-400"}`}
							>
								{symbol.priceChange > 0 ? "+" : ""}
								{(symbol.priceChange ?? 0).toFixed(3)}%
							</NumericFont>
						</div>
						<div className="bg-dark-400/30 rounded p-3">
							<div className="text-[10px] text-gray-500 mb-1">
								Phase {currentPhase} Threshold
							</div>
							<div className="text-lg font-numeric text-yellow-400">
								≥ {threshold}%
							</div>
						</div>
					</div>

					<div className="mt-4">
						<div className="text-xs text-gray-500 mb-2 font-numeric">
							Confidence ({(symbol.confidence ?? 0).toFixed(1)}% / {threshold}
							%)
						</div>
						<ConfidenceMeter
							confidence={symbol.confidence}
							threshold={threshold}
						/>
					</div>
				</div>

				{/* Signal Details */}
				<div className="p-4 border-b border-dark-700">
					<h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
						<Brain size={16} /> Signal Breakdown (Phase {currentPhase})
					</h3>
					<div className="bg-dark-400/30 rounded overflow-hidden">
						<SignalDetailRow
							{...SIGNAL_CONFIGS.lsRatio}
							value={symbol.signals.lsRatio ? 1 - symbol.signals.lsRatio : null}
							age={symbol.signals.lsAge}
							phaseMultiplier={
								SIGNAL_CONFIGS.lsRatio.phaseMultipliers[currentPhase]
							}
						/>
						<SignalDetailRow
							{...SIGNAL_CONFIGS.orderBook}
							value={symbol.signals.orderBookImbalance}
							age={symbol.signals.orderBookAge}
							phaseMultiplier={
								SIGNAL_CONFIGS.orderBook.phaseMultipliers[currentPhase]
							}
						/>
						<SignalDetailRow
							{...SIGNAL_CONFIGS.tvTech}
							value={symbol.signals.tvTechRating}
							age={symbol.signals.tvAge}
							phaseMultiplier={
								SIGNAL_CONFIGS.tvTech.phaseMultipliers[currentPhase]
							}
						/>
						<SignalDetailRow
							{...SIGNAL_CONFIGS.tradersUnion}
							value={symbol.signals.tuScore}
							age={symbol.signals.tuAge}
							phaseMultiplier={
								SIGNAL_CONFIGS.tradersUnion.phaseMultipliers[currentPhase]
							}
						/>
						<SignalDetailRow
							{...SIGNAL_CONFIGS.tradeFlow}
							value={symbol.signals.tradeFlow}
							age={symbol.signals.tradeFlowAge}
							phaseMultiplier={
								SIGNAL_CONFIGS.tradeFlow.phaseMultipliers[currentPhase]
							}
						/>
						<SignalDetailRow
							{...SIGNAL_CONFIGS.whaleLeaders}
							value={symbol.signals.whaleLeaders}
							age={symbol.signals.whaleLeadersAge}
							phaseMultiplier={
								SIGNAL_CONFIGS.whaleLeaders.phaseMultipliers[currentPhase]
							}
						/>
						<SignalDetailRow
							{...SIGNAL_CONFIGS.liquidations}
							value={symbol.signals.liquidations}
							age={symbol.signals.liquidationsAge}
							phaseMultiplier={
								SIGNAL_CONFIGS.liquidations.phaseMultipliers[currentPhase]
							}
						/>
					</div>
				</div>

				{/* Prediction History */}
				<div className="p-4">
					<h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
						<Calendar size={16} /> Prediction History
					</h3>

					{historyData?.stats && (
						<>
							<div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
								<div className="bg-dark-400/30 rounded p-3 text-center">
									<NumericFont className="text-2xl font-bold text-gray-100">
										{historyData.stats.totalPredictions}
									</NumericFont>
									<div className="text-[10px] text-gray-500">Total</div>
								</div>
								<div className="bg-dark-400/30 rounded p-3 text-center">
									<NumericFont className="text-2xl font-bold text-green-400">
										{historyData.stats.wins}
									</NumericFont>
									<div className="text-[10px] text-green-400">Wins</div>
								</div>
								<div className="bg-dark-400/30 rounded p-3 text-center">
									<NumericFont className="text-2xl font-bold text-red-400">
										{historyData.stats.losses}
									</NumericFont>
									<div className="text-[10px] text-red-400">Losses</div>
								</div>
								<div className="bg-dark-400/30 rounded p-3 text-center">
									<NumericFont
										className={`text-2xl font-bold ${historyData.stats.winRate >= 50 ? "text-green-400" : "text-red-400"}`}
									>
										{historyData.stats.winRate.toFixed(1)}%
									</NumericFont>
									<div className="text-[10px] text-gray-500">Win Rate</div>
								</div>
								<div className="bg-dark-400/30 rounded p-3 text-center">
									<NumericFont className="text-2xl font-bold text-blue-400">
										{historyData.stats.avgConfidence.toFixed(0)}%
									</NumericFont>
									<div className="text-[10px] text-gray-500">
										Avg Confidence
									</div>
								</div>
							</div>
							<div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
								<div className="bg-dark-400/30 rounded p-3 text-center">
									<NumericFont
										className={`text-2xl font-bold ${
											bestPnl === null
												? "text-gray-500"
												: bestPnl >= 0
													? "text-green-400"
													: "text-red-400"
										}`}
									>
										{bestPnl === null
											? "-"
											: `${bestPnl >= 0 ? "+" : ""}${bestPnl.toFixed(2)}%`}
									</NumericFont>
									<div className="text-[10px] text-gray-500">Best P&L</div>
								</div>
								<div className="bg-dark-400/30 rounded p-3 text-center">
									<NumericFont
										className={`text-2xl font-bold ${
											worstPnl === null
												? "text-gray-500"
												: worstPnl <= 0
													? "text-red-400"
													: "text-green-400"
										}`}
									>
										{worstPnl === null
											? "-"
											: `${worstPnl >= 0 ? "+" : ""}${worstPnl.toFixed(2)}%`}
									</NumericFont>
									<div className="text-[10px] text-gray-500">Worst P&L</div>
								</div>
								<div className="bg-dark-400/30 rounded p-3 text-center">
									<NumericFont
										className={`text-2xl font-bold ${
											netPnl === null
												? "text-gray-500"
												: netPnl >= 0
													? "text-green-400"
													: "text-red-400"
										}`}
									>
										{netPnl === null
											? "-"
											: `${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)}%`}
									</NumericFont>
									<div className="text-[10px] text-gray-500">
										{netPnl === null
											? "Net Result"
											: netPnl >= 0
												? "Net Profit"
												: "Net Loss"}
									</div>
								</div>
							</div>
						</>
					)}

					{historyData?.predictions && historyData.predictions.length > 0 ? (
						<div className="bg-dark-400/30 rounded overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
							<table className="w-full text-xs">
								<thead className="bg-dark-900 sticky top-0">
									<tr className="text-gray-500">
										<th className="text-left p-2">Time</th>
										<th className="text-center p-2">Phase</th>
										<th className="text-center p-2">Direction</th>
										<th className="text-right p-2">Confidence</th>
										<th className="text-right p-2">Open</th>
										<th className="text-right p-2">Close</th>
										<th className="text-right p-2">P&L</th>
										<th className="text-center p-2">Result</th>
									</tr>
								</thead>
								<tbody>
									{historyData.predictions.map((pred, idx) => (
										<tr
											key={idx}
											className="odd:bg-dark-800/20 hover:bg-dark-700/40 transition-colors"
										>
											<td className="p-2 text-gray-400 font-numeric">
												{new Date(pred.timestamp).toLocaleString()}
											</td>
											<td className="p-2 text-center">
												<span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">
													P{pred.phase}
												</span>
											</td>
											<td className="p-2 text-center">
												<span
													className={`${pred.direction === "UP" ? "text-green-400" : "text-red-400"}`}
												>
													{pred.direction === "UP" ? "↑" : "↓"} {pred.direction}
												</span>
											</td>
											<td className="p-2 text-right font-numeric text-gray-400">
												{pred.confidence.toFixed(1)}%
											</td>
											<td className="p-2 text-right font-numeric text-gray-500">
												${pred.openPrice.toFixed(2)}
											</td>
											<td className="p-2 text-right font-numeric text-gray-400">
												{pred.closePrice
													? `$${pred.closePrice.toFixed(2)}`
													: "-"}
											</td>
											<td
												className={`p-2 text-right font-numeric ${pred.pnl && pred.pnl > 0 ? "text-green-400" : pred.pnl && pred.pnl < 0 ? "text-red-400" : "text-gray-500"}`}
											>
												{pred.pnl
													? `${pred.pnl > 0 ? "+" : ""}${pred.pnl.toFixed(2)}%`
													: "-"}
											</td>
											<td className="p-2 text-center">
												{pred.outcome === "WIN" && (
													<span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">
														WIN
													</span>
												)}
												{pred.outcome === "LOSS" && (
													<span className="px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded text-[10px]">
														LOSS
													</span>
												)}
												{pred.outcome === "PENDING" && (
													<span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px]">
														⏳
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<div className="bg-dark-400/30 rounded p-8 text-center text-gray-600">
							<Calendar size={32} className="mx-auto mb-2 opacity-30" />
							<p>No prediction history for this symbol yet</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default SymbolDetails;
