import NumberFlow from "@number-flow/react";
import * as d3 from "d3";
import { Activity, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardCardWrapper } from "@/ui/components";

interface MarketImpact {
	marketId: string;
	ticker: string;
	title: string;
	volume24hr: number;
	newsRelevance: number;
	impactScore: number;
	relatedHighlights?: string[];
	prob?: number; // We added this
}

interface HistoryPoint {
	timestamp: string;
	impact_score: number;
	prob: number;
}

const HistoryChart = ({ data }: { data: HistoryPoint[] }) => {
	if (data.length < 2) {
		return (
			<div className="h-full w-full flex items-center justify-center text-xs text-gray-500">
				Not enough data for history chart
			</div>
		);
	}

	const width = 500; // Fixed width for modal
	const height = 180;
	const margin = { top: 10, right: 10, bottom: 20, left: 30 };
	const w = width - margin.left - margin.right;
	const h = height - margin.top - margin.bottom;

	// Scales
	const x = d3
		.scaleTime()
		.domain(d3.extent(data, (d) => new Date(d.timestamp)) as [Date, Date])
		.range([0, w]);

	const y = d3
		.scaleLinear()
		.domain([0, 100]) // Impact score is 0-100
		.range([h, 0]);

	const line = d3
		.line<HistoryPoint>()
		.x((d) => x(new Date(d.timestamp)))
		.y((d) => y(d.impact_score))
		.curve(d3.curveMonotoneX);

	const area = d3
		.area<HistoryPoint>()
		.x((d) => x(new Date(d.timestamp)))
		.y0(h)
		.y1((d) => y(d.impact_score))
		.curve(d3.curveMonotoneX);

	// Generate grid ticks
	const xTicks = x.ticks(5);
	const yTicks = [0, 25, 50, 75, 100];

	return (
		<div className="w-full h-full relative">
			<svg
				width="100%"
				height="100%"
				viewBox={`0 0 ${width} ${height}`}
				preserveAspectRatio="none"
			>
				<g transform={`translate(${margin.left},${margin.top})`}>
					{/* Gridlines Y */}
					{yTicks.map((tick) => (
						<line
							key={`y-${tick}`}
							x1={0}
							x2={w}
							y1={y(tick)}
							y2={y(tick)}
							stroke="#222"
							strokeWidth={1}
						/>
					))}

					{/* Gridlines X */}
					{xTicks.map((tick, i) => (
						<line
							key={`x-${i}`}
							x1={x(tick)}
							x2={x(tick)}
							y1={0}
							y2={h}
							stroke="#222"
							strokeWidth={1}
						/>
					))}

					{/* Area */}
					<path
						d={area(data) || ""}
						fill="url(#impact-gradient)"
						opacity={0.3}
					/>

					{/* Line */}
					<path
						d={line(data) || ""}
						stroke="#6366f1"
						strokeWidth={2}
						fill="none"
					/>

					{/* Gradient Def */}
					<defs>
						<linearGradient id="impact-gradient" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#6366f1" stopOpacity={0.8} />
							<stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
						</linearGradient>
					</defs>

					{/* Y Axes Labels */}
					{yTicks.map((tick) => (
						<text
							key={tick}
							x={-25}
							y={y(tick) + 3}
							fill="#9ca3af"
							fontSize={10}
						>
							{tick}
						</text>
					))}

					{/* X Axes Labels */}
					{xTicks.map((tick, i) => (
						<text
							key={i}
							x={x(tick)}
							y={h + 15}
							fill="#9ca3af"
							fontSize={9}
							textAnchor="middle"
						>
							{tick.toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit",
							})}
						</text>
					))}
				</g>
			</svg>
		</div>
	);
};

export const NewsImpactWidget = ({ data }: { data: any }) => {
	const [selectedMarket, setSelectedMarket] = useState<MarketImpact | null>(
		null,
	);
	const [history, setHistory] = useState<HistoryPoint[]>([]);
	const [loadingHistory, setLoadingHistory] = useState(false);

	useEffect(() => {
		if (selectedMarket) {
			setLoadingHistory(true);
			fetch(
				`/api/news-impact/history?marketId=${selectedMarket.marketId}&limit=50`,
			)
				.then((res) => {
					if (!res.ok) throw new Error("Failed to fetch");
					return res.json();
				})
				.then((data) => {
					setHistory(data);
					setLoadingHistory(false);
				})
				.catch((err) => {
					console.error(err);
					setLoadingHistory(false);
				});
		} else {
			setHistory([]);
		}
	}, [selectedMarket]);

	if (!data || !data.markets) {
		return (
			<DashboardCardWrapper className="flex items-center justify-center p-4">
				<span className="text-white/50 text-xs">
					Waiting for impact analysis...
				</span>
			</DashboardCardWrapper>
		);
	}

	// max 5 items
	const markets = (data.markets as MarketImpact[]).slice(0, 5);

	return (
		<>
			<DashboardCardWrapper className="p-5">
				{/* Header */}
				<h3 className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4 relative z-10">
					<Zap size={14} className="text-indigo-400 animate-pulse" />
					Vector Impact
				</h3>

				{/* Content */}
				<div className="flex-1 min-h-0 overflow-y-auto z-10 space-y-2 pr-1">
					{markets.map((m, _i) => (
						<div
							key={m.marketId}
							className="group relative cursor-pointer hover:bg-white/5 p-1 rounded transition-colors"
							onClick={() => setSelectedMarket(m)}
						>
							<div className="flex justify-between items-start mb-1">
								<span className="text-[11px] text-white/90 font-medium truncate max-w-[70%] group-hover:text-indigo-300 transition-colors">
									{m.title}
								</span>
								<span className="text-[10px] font-numeric text-indigo-400">
									<NumberFlow value={Math.round(m.impactScore)} />
									/100
								</span>
							</div>

							{/* Progress bar as vector relevance */}
							<div className="h-1 w-full bg-dark-600 rounded-full overflow-hidden">
								<div
									className="h-full bg-indigo-500 rounded-full transition-all duration-500"
									style={{ width: `${Math.min(100, m.newsRelevance * 100)}%` }}
								/>
							</div>
							<div className="flex justify-between mt-1 text-[9px] text-white/50">
								<span>SIM: {(m.newsRelevance * 100).toFixed(0)}%</span>
								<span>
									VOL: $
									<NumberFlow
										value={m.volume24hr / 1000}
										format={{
											minimumFractionDigits: 1,
											maximumFractionDigits: 1,
										}}
									/>
									k
								</span>
							</div>

							{/* Attribution / Context */}
							{m.relatedHighlights && m.relatedHighlights.length > 0 && (
								<div className="mt-1 pl-2 border-l-2 border-indigo-900/50">
									<p className="text-[10px] text-white/70 italic line-clamp-2">
										"{m.relatedHighlights[0]}"
									</p>
								</div>
							)}
						</div>
					))}

					{markets.length === 0 && (
						<div className="text-center text-white/50 text-xs mt-10">
							No high-impact correlations found.
						</div>
					)}
				</div>
			</DashboardCardWrapper>

			{/* Detail Modal */}
			{selectedMarket && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/80 backdrop-blur-sm"
					onClick={() => setSelectedMarket(null)}
				>
					<DashboardCardWrapper
						className="p-6 w-[600px] max-w-full shadow-2xl relative bg-dark-500"
						onClick={(e: React.MouseEvent) => e.stopPropagation()}
					>
						<button
							onClick={() => setSelectedMarket(null)}
							className="absolute top-4 right-4 text-white/50 hover:text-white"
						>
							<X size={18} />
						</button>

						<h2 className="text-lg font-bold text-white mb-1 pr-6">
							{selectedMarket.title}
						</h2>
						<div className="flex items-center gap-4 text-xs text-white/50 mb-6">
							<span className="text-indigo-400">
								Score: {Math.round(selectedMarket.impactScore)}/100
							</span>
							<span>
								Vol: ${(selectedMarket.volume24hr / 1000).toFixed(1)}k
							</span>
							{selectedMarket.prob !== undefined && (
								<span>Cur Prob: {(selectedMarket.prob * 100).toFixed(1)}%</span>
							)}
						</div>

						{/* Chart Area */}
						<div className="h-48 w-full bg-dark-600/30 rounded-lg mb-6 flex items-center justify-center relative overflow-hidden p-2">
							{loadingHistory ? (
								<div className="flex flex-col items-center gap-2">
									<Activity className="animate-spin text-indigo-500" />
									<span className="text-xs text-white/50">
										Loading History...
									</span>
								</div>
							) : (
								<HistoryChart data={history} />
							)}
						</div>

						<div className="space-y-4">
							<h3 className="text-sm font-semibold text-gray-200">
								Driving News Highlights
							</h3>
							{selectedMarket.relatedHighlights &&
							selectedMarket.relatedHighlights.length > 0 ? (
								selectedMarket.relatedHighlights.map((highlight, idx) => (
									<div
										key={idx}
										className="p-3 bg-[#111] rounded border-l-2 border-indigo-500 text-xs text-gray-300"
									>
										{highlight}
									</div>
								))
							) : (
								<div className="text-xs text-gray-500">
									No specific highlights attributed.
								</div>
							)}
						</div>
					</DashboardCardWrapper>
				</div>
			)}
		</>
	);
};
