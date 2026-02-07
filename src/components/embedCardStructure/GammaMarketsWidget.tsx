import NumberFlow from "@number-flow/react";
import * as d3 from "d3";
import { Activity, ExternalLink, Info, Maximize2, X, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardCardWrapper } from "@/ui/components";

interface GammaMarketInfo {
	id: string;
	question: string;
	slug: string;
	volume: number;
	outcomes: string;
	outcomePrices: string;
	timestamp: number;
}

interface WidgetState {
	newMarkets: GammaMarketInfo[];
	updatedMarkets: GammaMarketInfo[];
}

const _formatMoney = (val: number) => {
	if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
	if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
	return `$${val.toFixed(0)}`;
};

/**
 * Bubble Chart for Visualization of Markets
 * Bubbles sized by Volume
 * Color by Type (New vs Update)
 */
interface BubbleData extends d3.SimulationNodeDatum {
	id: string;
	r: number; // radius
	market: GammaMarketInfo;
	type: "new" | "update";
	color: string;
}

const BubbleChart = ({
	data,
	onBubbleClick,
	height = 300,
}: {
	data: BubbleData[];
	onBubbleClick: (m: GammaMarketInfo) => void;
	height?: number;
}) => {
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!svgRef.current || !data.length || !containerRef.current) return;
		const width = containerRef.current.clientWidth;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		// Scale radius based on volume (log scale to prevent huge bubbles)
		const sizeScale = d3
			.scaleLog()
			.domain([
				1,
				Math.max(100000, d3.max(data, (d) => d.market.volume) || 100),
			])
			.range([15, 55])
			.clamp(true);

		// Update radius in data
		data.forEach((d) => {
			d.r = sizeScale(Math.max(1, d.market.volume));
		});

		const simulation = d3
			.forceSimulation(data)
			.force("x", d3.forceX(width / 2).strength(0.08))
			.force("y", d3.forceY(height / 2).strength(0.08))
			.force("collide", d3.forceCollide((d: any) => d.r + 2).iterations(4))
			.force("charge", d3.forceManyBody().strength(-20));

		// Draw Elements
		const nodes = svg
			.selectAll("g")
			.data(data)
			.join("g")
			.attr("class", "cursor-pointer transition-opacity hover:opacity-100")
			.style("opacity", 0.9)
			.on("click", (_e, d) => onBubbleClick(d.market));

		// Circles
		nodes
			.append("circle")
			.attr("r", (d) => d.r)
			.attr("fill", (d) => d.color)
			.attr("stroke", "#000")
			.attr("stroke-width", 2)
			.attr("class", "hover:brightness-110 transition-all");

		// Labels (Truncated)
		nodes
			.append("foreignObject")
			.attr("x", (d) => -d.r)
			.attr("y", (d) => -d.r)
			.attr("width", (d) => d.r * 2)
			.attr("height", (d) => d.r * 2)
			.append("xhtml:div")
			.style("width", "100%")
			.style("height", "100%")
			.style("display", "flex")
			.style("flex-direction", "column")
			.style("align-items", "center")
			.style("justify-content", "center")
			.style("text-align", "center")
			.style("font-size", "10px")
			.style("line-height", "1.1")
			.style("color", "white")
			.style("pointer-events", "none")
			.style("padding", "2px")
			.html((d) => {
				// Only show text if big enough
				if (d.r < 25) return "";
				return `<div style="overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${d.market.question}</div>`;
			});

		simulation.on("tick", () => {
			nodes.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
		});

		return () => {
			simulation.stop();
		};
	}, [data, height, onBubbleClick]);

	return (
		<div ref={containerRef} className="w-full h-full relative">
			<svg ref={svgRef} width="100%" height={height} className="rounded-lg" />
			{data.length === 0 && (
				<div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
					Waiting for events...
				</div>
			)}
		</div>
	);
};

export const GammaMarketsWidget: React.FC<{ data?: WidgetState }> = ({
	data: initialData,
}) => {
	const [showModal, setShowModal] = useState(false);
	const [selectedMarket, setSelectedMarket] = useState<GammaMarketInfo | null>(
		null,
	);

	// Use passed data or empty default
	const data = initialData || {
		newMarkets: [],
		updatedMarkets: [],
	};

	// Combine for Visualization
	const vizData = useMemo<BubbleData[]>(() => {
		const bubbles: BubbleData[] = [];

		data.newMarkets.forEach((m) => {
			bubbles.push({
				id: `new-${m.id}`,
				market: m,
				type: "new",
				color: "#2563eb", // Blue-600
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
				r: 0,
			});
		});

		data.updatedMarkets.forEach((m) => {
			// Dedup by ID if same market appears in both (unlikely but possible)
			if (!bubbles.find((b) => b.market.id === m.id)) {
				bubbles.push({
					id: `upd-${m.id}`,
					market: m,
					type: "update",
					color: "#9333ea", // Purple-600
					x: 0,
					y: 0,
					vx: 0,
					vy: 0,
					r: 0,
				});
			}
		});

		return bubbles.slice(0, 20); // Limit to top 20 for bubble physics perf
	}, [data]);

	const handleBubbleClick = (m: GammaMarketInfo) => {
		setSelectedMarket(m);
		setShowModal(true);
	};

	return (
		<>
			<DashboardCardWrapper className="p-5">
				{/* Header */}
				<h3 className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4">
					<Zap size={14} className="text-yellow-500" />
					Gamma Markets
				</h3>

				{/* Legend */}
				<div className="flex justify-end gap-2 text-[9px] mb-2 -mt-8">
					<span className="flex items-center gap-1 text-white/50">
						<span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
						NEW
					</span>
					<span className="flex items-center gap-1 text-white/50">
						<span className="w-1.5 h-1.5 bg-purple-600 rounded-full"></span>
						UPD
					</span>
					<button
						onClick={() => setShowModal(true)}
						className="text-white/50 hover:text-white transition-colors"
					>
						<Maximize2 size={12} />
					</button>
				</div>

				{/* Bubble Viz */}
				<div className="flex-1 bg-transparent p-1 min-h-0 relative">
					<BubbleChart
						data={vizData}
						onBubbleClick={handleBubbleClick}
						height={260}
					/>
					<div className="absolute bottom-2 left-0 w-full text-center text-[9px] text-white/50 pointer-events-none">
						Bubble size correlates to volume
					</div>
				</div>
			</DashboardCardWrapper>

			{/* Full Modal */}
			{showModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/80 backdrop-blur-sm p-4">
					<DashboardCardWrapper className="w-full max-w-5xl h-[80vh] bg-dark-500 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
						{/* Modal Header */}
						<div className="flex items-center justify-between p-4 bg-dark-600 rounded-t-xl">
							<div className="flex items-center gap-4">
								<div className="p-2 bg-yellow-900/20 rounded-lg">
									<Zap className="text-yellow-500" size={20} />
								</div>
								<div>
									<h2 className="text-lg font-bold text-white">
										Gamma Intel Stream
									</h2>
									<p className="text-xs text-white/50 uppercase">
										New Market Creation & Significant Updates
									</p>
								</div>
							</div>
							<button
								onClick={() => setShowModal(false)}
								className="p-2 text-white/50 hover:text-white hover:bg-dark-400 rounded transition-all"
							>
								<X size={20} />
							</button>
						</div>

						<div className="flex-1 overflow-hidden p-4 flex gap-4">
							{/* Left: Detailed List */}
							<div className="flex-1 overflow-auto bg-dark-600/30 rounded-lg p-2">
								<h3 className="text-xs font-semibold text-white/50 mb-3 px-2">
									RECENT EVENTS FEED
								</h3>
								{[...data.newMarkets, ...data.updatedMarkets]
									.sort((a, b) => b.timestamp - a.timestamp)
									.map((m, i) => {
										const isNew = data.newMarkets.some((nm) => nm.id === m.id);

										let prices = [];
										let outcomes = [];
										try {
											prices = JSON.parse(m.outcomePrices);
											outcomes = JSON.parse(m.outcomes);
										} catch (_e) {}

										return (
											<div
												key={m.id + i}
												onClick={() => setSelectedMarket(m)}
												className={`p-3 mb-2 rounded cursor-pointer transition-colors ${selectedMarket?.id === m.id ? "bg-white/5" : "bg-dark-500/40 hover:bg-white/5"}`}
											>
												<div className="flex justify-between items-start mb-1">
													<span
														className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isNew ? "bg-blue-900/30 text-blue-400" : "bg-purple-900/30 text-purple-400"}`}
													>
														{isNew ? "NEW MARKET" : "UPDATE"}
													</span>
													<span className="text-[10px] text-white/40">
														{new Date(m.timestamp).toLocaleTimeString()}
													</span>
												</div>
												<h4 className="text-sm font-medium text-white/90 mb-2 line-clamp-2">
													{m.question}
												</h4>
												<div className="flex gap-4 text-xs text-white/50">
													<span className="flex items-center gap-1">
														<Activity size={10} />{" "}
														<NumberFlow
															value={m.volume}
															format={{
																style: "currency",
																currency: "USD",
																notation: "compact",
																maximumFractionDigits: 1,
															}}
														/>
													</span>
													{outcomes.length > 0 && (
														<span className="flex items-center gap-1 text-white/50">
															Top: {outcomes[0]} (
															{Math.round(parseFloat(prices[0]) * 100)}%)
														</span>
													)}
												</div>
											</div>
										);
									})}
							</div>

							{/* Right: Selected Market Detail */}
							<div className="w-[350px] bg-dark-600 rounded-lg p-6 flex flex-col items-center justify-center text-center">
								{selectedMarket ? (
									<>
										<div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-4 flex items-center justify-center shadow-lg shadow-purple-900/40">
											<Zap size={32} className="text-white" />
										</div>
										<h2 className="text-lg font-bold text-white mb-2">
											{selectedMarket.question}
										</h2>

										<div className="grid grid-cols-2 gap-4 w-full mt-6 mb-6">
											<div className="bg-dark-500 p-3 rounded-lg">
												<div className="text-[10px] text-white/50 uppercase">
													Volume
												</div>
												<div className="text-xl font-numeric text-white">
													<NumberFlow
														value={selectedMarket.volume}
														format={{
															style: "currency",
															currency: "USD",
															notation: "compact",
															maximumFractionDigits: 1,
														}}
													/>
												</div>
											</div>
											<div className="bg-dark-500 p-3 rounded-lg">
												<div className="text-[10px] text-white/50 uppercase">
													Outcomes
												</div>
												<div className="text-xl font-numeric text-white">
													{(() => {
														try {
															return JSON.parse(selectedMarket.outcomes).length;
														} catch {
															return "?";
														}
													})()}
												</div>
											</div>
										</div>

										<a
											href={`https://polymarket.com/event/${selectedMarket.slug}`}
											target="_blank"
											rel="noopener noreferrer"
											className="w-full py-3 bg-white text-black font-bold rounded hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
										>
											Trade on Polymarket <ExternalLink size={16} />
										</a>
									</>
								) : (
									<div className="text-white/50 flex flex-col items-center">
										<Info size={40} className="mb-2 opacity-20" />
										<p className="text-sm">Select an event to view details</p>
									</div>
								)}
							</div>
						</div>
					</DashboardCardWrapper>
				</div>
			)}
		</>
	);
};
