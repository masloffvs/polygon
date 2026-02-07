import NumberFlow from "@number-flow/react";
import {
	ArrowDown,
	ArrowUp,
	Brain,
	CheckCircle,
	Clock,
	ExternalLink,
	Maximize2,
	Target,
	Trophy,
	X,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardCardWrapper } from "@/ui/components";

interface CryptoPredictionWidgetProps {
	data?: {
		windowStart: number;
		windowEnd?: number;
		accuracy: number;
		totalVolume: number;
		profitableVolume: number;
		longRatio: number;
		topTraders: {
			user: string;
			userAddress?: string;
			asset: string;
			pnl: number;
			outcome: string;
			size: number;
			avgEntry?: number;
			currentPrice?: number;
		}[];
		assetStats: {
			symbol: string;
			accuracy: number;
			volume: number;
		}[];
	};
}

const CountdownTimer = ({ target }: { target: number }) => {
	const [timeLeft, setTimeLeft] = useState<string>("");

	useEffect(() => {
		const update = () => {
			const diff = target - Date.now();
			if (diff <= 0) {
				setTimeLeft("00:00");
				return;
			}
			const m = Math.floor(diff / 60000);
			const s = Math.floor((diff % 60000) / 1000);
			setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
		};
		update();
		const i = setInterval(update, 1000);
		return () => clearInterval(i);
	}, [target]);

	return <span className="font-numeric">{timeLeft}</span>;
};

export const CryptoPredictionWidget = ({
	data,
}: CryptoPredictionWidgetProps) => {
	const [showModal, setShowModal] = useState(false);

	if (!data || data.totalVolume === 0) {
		return (
			<DashboardCardWrapper className="flex flex-col items-center justify-center text-white/50 text-xs">
				<Brain size={24} className="mb-2 opacity-20" />
				Analyzing Prediction Accuracy...
			</DashboardCardWrapper>
		);
	}

	const getAccuracyColor = (val: number) => {
		if (val >= 60) return "text-lime-500";
		if (val <= 40) return "text-red-500";
		return "text-yellow-500";
	};

	const isMarketBullish = data.longRatio > 50;

	return (
		<>
			<DashboardCardWrapper className="p-5 flex flex-col relative overflow-hidden group">
				{/* Header */}
				<h3 className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4 z-10 relative">
					<Target size={14} className="text-blue-500" />
					Smart Money
					<button
						onClick={() => setShowModal(true)}
						className="text-white/50 hover:text-white transition-colors ml-auto"
					>
						<Maximize2 size={12} />
					</button>
				</h3>

				<div className="flex items-center justify-between mb-4">
					<p className="text-[10px] text-white/50">
						Prediction Accuracy (15m)
					</p>
					<div className="text-right">
						<div
							className={`text-xl font-bold font-numeric leading-none ${getAccuracyColor(
								data.accuracy,
							)}`}
						>
							<NumberFlow
								value={data.accuracy}
								format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
							/>
							%
						</div>
						<div className="text-[9px] text-white/40 uppercase tracking-wider mt-1">
							Correct Calls
						</div>
					</div>
				</div>

				{/* Main Stats Grid */}
				<div className="grid grid-cols-2 gap-2 mb-4 flex-shrink-0">
					<div className="bg-white/5 rounded p-2">
						<div className="text-[9px] text-white/40 uppercase mb-1">
							Sentiment
						</div>
						<div className="flex items-center gap-1.5">
							{isMarketBullish ? (
								<ArrowUp size={12} className="text-lime-500" />
							) : (
								<ArrowDown size={12} className="text-red-500" />
							)}
							<span
								className={`text-sm font-semibold ${
									isMarketBullish ? "text-lime-500" : "text-red-500"
								}`}
							>
								{isMarketBullish ? "BULLISH" : "BEARISH"}
							</span>
						</div>
						<div className="text-[9px] text-white/60 mt-0.5 font-numeric">
							<NumberFlow
								value={data.longRatio}
								format={{ maximumFractionDigits: 0 }}
							/>
							% Longs
						</div>
					</div>

					<div className="bg-white/5 rounded p-2">
						<div className="text-[9px] text-white/40 uppercase mb-1">
							Best Asset
						</div>
						{data.assetStats.length > 0 ? (
							(() => {
								const best = [...data.assetStats].sort(
									(a, b) => b.accuracy - a.accuracy,
								)[0];
								return (
									<div>
										<div className="text-sm font-semibold text-white/90">
											{best.symbol}
										</div>
										<div
											className={`text-[9px] font-numeric ${getAccuracyColor(
												best.accuracy,
											)}`}
										>
											<NumberFlow
												value={best.accuracy}
												format={{
													minimumFractionDigits: 1,
													maximumFractionDigits: 1,
												}}
											/>
											% Accuracy
										</div>
									</div>
								);
							})()
						) : (
							<div className="text-xs text-white/40">-</div>
						)}
					</div>
				</div>

				{/* Top Predictors List */}
				<div className="flex-1 min-h-0 flex flex-col">
					<div className="flex items-center gap-1.5 mb-2 text-[10px] text-white/40 uppercase tracking-wide">
						<Trophy size={10} className="text-yellow-500" />
						<span>Top Snipers</span>
					</div>

					<div className="overflow-y-auto custom-scrollbar flex-1 space-y-1 pr-1">
						{data.topTraders.length === 0 ? (
							<div className="text-center text-white/40 text-[10px] py-2">
								No profitable trades yet
							</div>
						) : (
							data.topTraders.slice(0, 5).map((trader, i) => (
								<div
									key={i}
									className="flex items-center justify-between p-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors group"
								>
									<div className="flex items-center gap-2 min-w-0">
										<span
											className={`text-[8px] font-bold px-1 rounded ${
												trader.asset === "BTC"
													? "bg-[#f7931a] text-black"
													: "bg-[#627eea] text-white"
											}`}
										>
											{trader.asset}
										</span>
										<div className="truncate max-w-[80px]">
											<div className="text-[10px] text-white/80 truncate">
												{trader.user}
											</div>
										</div>
									</div>
									<div className="text-right">
										<div className="text-[10px] font-numeric text-lime-500">
											+
											<NumberFlow
												value={Math.abs(trader.pnl)}
												format={{
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												}}
											/>
											%
										</div>
										<div className="text-[8px] text-white/40">
											{trader.outcome}
										</div>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			</DashboardCardWrapper>

			{/* Drill-down Modal */}
			{showModal && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-900/80 backdrop-blur-sm p-4">
					<div className="bg-dark-500 w-full max-w-4xl h-[80vh] flex flex-col rounded-xl shadow-2xl relative">
						<button
							onClick={() => setShowModal(false)}
							className="absolute top-4 right-4 text-[#666] hover:text-white transition-colors"
						>
							<X size={20} />
						</button>

						{/* Modal Header */}
						<div className="p-6 bg-dark-600 rounded-t-xl">
							<div className="flex items-center gap-4 mb-2">
								<Target className="text-[#2979ff]" size={24} />
								<div>
									<h2 className="text-xl font-bold text-white">
										Smart Money Analysis
									</h2>
									<p className="text-xs text-[#666]">
										Deep dive into top performing whale predictions
									</p>
								</div>
							</div>

							<div className="flex items-center gap-6 mt-6">
								<div className="bg-dark-600 px-4 py-2 rounded">
									<div className="text-[10px] text-[#666] uppercase mb-1">
										Session
									</div>
									<div className="text-xl font-numeric text-lime-500 flex items-center gap-2">
										<Clock size={16} />
										{data.windowEnd ? (
											<CountdownTimer target={data.windowEnd} />
										) : (
											"--:--"
										)}
									</div>
								</div>

								<div className="bg-dark-600 px-4 py-2 rounded">
									<div className="text-[10px] text-[#666] uppercase mb-1">
										Win Rate
									</div>
									<div
										className={`text-xl font-numeric ${getAccuracyColor(
											data.accuracy,
										)}`}
									>
										{data.accuracy.toFixed(1)}%
									</div>
								</div>

								<div className="bg-dark-600 px-4 py-2 rounded">
									<div className="text-[10px] text-[#666] uppercase mb-1">
										Vol / Traders
									</div>
									<div className="text-xl font-numeric text-white flex items-center gap-2">
										<span>${(data.totalVolume / 1000).toFixed(1)}K</span>
										<span className="text-sm text-[#444]">
											/ {data.topTraders.length}
										</span>
									</div>
								</div>
							</div>
						</div>

						{/* Detailed Table */}
						<div className="flex-1 overflow-auto p-6">
							<table className="w-full text-left border-separate border-spacing-y-1">
								<thead>
									<tr className="text-[10px] uppercase text-[#666] tracking-wider">
										<th className="p-3 font-medium bg-dark-800/50 first:rounded-l-md">
											Trader
										</th>
										<th className="p-3 font-medium bg-dark-800/50">
											Position
										</th>
										<th className="p-3 font-medium text-right bg-dark-800/50">
											Size
										</th>
										<th className="p-3 font-medium text-right bg-dark-800/50">
											Entry
										</th>
										<th className="p-3 font-medium text-right bg-dark-800/50">
											Current
										</th>
										<th className="p-3 font-medium text-right bg-dark-800/50">
											PnL
										</th>
										<th className="p-3 font-medium text-center bg-dark-800/50 last:rounded-r-md">
											Status
										</th>
									</tr>
								</thead>
								<tbody className="text-xs">
									{data.topTraders.map((trader, i) => (
										<tr
											key={i}
											className="odd:bg-dark-800/20 hover:bg-dark-700/40 transition-colors"
										>
											<td className="p-3 text-[#ccc]">
												{trader.userAddress ? (
													<a
														href={`https://polymarket.com/profile/${trader.userAddress}`}
														target="_blank"
														rel="noopener noreferrer"
														className="group/link flex flex-col"
													>
														<span className="group-hover/link:text-[#2979ff] transition-colors flex items-center gap-1">
															{trader.user}
															<ExternalLink size={10} className="opacity-50" />
														</span>
														<span className="text-[9px] text-[#555] truncate max-w-[120px]">
															{trader.userAddress}
														</span>
													</a>
												) : (
													<div>
														<div>{trader.user}</div>
													</div>
												)}
											</td>
											<td className="p-3">
												<div className="flex items-center gap-2">
													<span
														className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
															trader.asset === "BTC"
																? "bg-[#f7931a]/10 text-[#f7931a]"
																: "bg-[#627eea]/10 text-[#627eea]"
														}`}
													>
														{trader.asset}
													</span>
													<span
														className={`text-[9px] uppercase px-1.5 py-0.5 rounded ${
															trader.outcome === "WIN" ||
															trader.outcome === "UP" ||
															trader.outcome === "YES"
																? "bg-lime-500/10 text-lime-500"
																: trader.outcome === "LOSS" ||
																		trader.outcome === "DOWN" ||
																		trader.outcome === "NO"
																	? "bg-red-500/10 text-red-500"
																	: "bg-yellow-500/10 text-yellow-500"
														}`}
													>
														{trader.outcome}
													</span>
												</div>
											</td>
											<td className="p-3 text-right text-white">
												${trader.size.toLocaleString()}
											</td>
											<td className="p-3 text-right text-[#888]">
												{trader.avgEntry
													? `$${trader.avgEntry.toLocaleString(undefined, {
															minimumFractionDigits: 2,
														})}`
													: "-"}
											</td>
											<td className="p-3 text-right text-white">
												{trader.currentPrice
													? `$${trader.currentPrice.toLocaleString(undefined, {
															minimumFractionDigits: 2,
														})}`
													: "-"}
											</td>
											<td
												className={`p-3 text-right ${
													trader.pnl >= 0 ? "text-lime-500" : "text-red-500"
												}`}
											>
												{trader.pnl > 0 ? "+" : ""}
												{trader.pnl.toFixed(2)}%
											</td>
											<td className="p-3 text-center">
												<div className="flex justify-center">
													{trader.pnl >= 0 ? (
														<CheckCircle size={14} className="text-lime-500" />
													) : (
														<XCircle size={14} className="text-red-500" />
													)}
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}
		</>
	);
};
