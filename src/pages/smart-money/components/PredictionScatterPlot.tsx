import * as d3 from "d3";
import { useEffect, useRef } from "react";
import type { SymbolState } from "../types";

const PredictionScatterPlot = ({
	data,
	onSelect,
	width = "100%",
	height = 300,
}: {
	data: SymbolState[];
	onSelect: (s: SymbolState) => void;
	width?: string | number;
	height?: number;
}) => {
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!svgRef.current || !containerRef.current || data.length === 0) return;

		const w = containerRef.current.clientWidth;
		const h = height;
		const margin = { top: 20, right: 30, bottom: 30, left: 40 };

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		// Scales
		const x = d3
			.scaleLinear()
			.domain([0, 100])
			.range([margin.left, w - margin.right]);

		const yMax = Math.max(1.0, d3.max(data, (d) => d.score || 0) || 1.0);
		const yDomain = [-yMax, yMax];

		const y = d3
			.scaleLinear()
			.domain(yDomain)
			.range([h - margin.bottom, margin.top]);

		// Grid
		const g = svg.append("g");

		// Center Line
		g.append("line")
			.attr("x1", margin.left)
			.attr("x2", w - margin.right)
			.attr("y1", y(0))
			.attr("y2", y(0))
			.attr("stroke", "#3f3f46") // dark-600 equivalent
			.attr("stroke-dasharray", "4,4");

		// Axes
		const xAxis = (g: any) =>
			g
				.attr("transform", `translate(0,${h - margin.bottom})`)
				.call(
					d3
						.axisBottom(x)
						.ticks(5)
						.tickFormat((d) => `${d}%`),
				)
				.call((g: any) => g.select(".domain").remove())
				.call((g: any) => g.selectAll(".tick line").attr("stroke", "#27272a")) // dark-700
				.call((g: any) => g.selectAll(".tick text").attr("fill", "#71717a")); // gray-500

		const yAxis = (g: any) =>
			g
				.attr("transform", `translate(${margin.left},0)`)
				.call(d3.axisLeft(y).ticks(5))
				.call((g: any) => g.select(".domain").remove())
				.call((g: any) => g.selectAll(".tick line").attr("stroke", "#27272a")) // dark-700
				.call((g: any) => g.selectAll(".tick text").attr("fill", "#71717a")); // gray-500

		svg.append("g").call(xAxis);
		svg.append("g").call(yAxis);

		// Labels
		svg
			.append("text")
			.attr("x", w / 2)
			.attr("y", h - 5)
			.attr("text-anchor", "middle")
			.attr("fill", "#52525b") // gray-600
			.attr("font-size", 10)
			.text("CONFIDENCE");

		svg
			.append("text")
			.attr("transform", "rotate(-90)")
			.attr("x", -h / 2)
			.attr("y", 12)
			.attr("text-anchor", "middle")
			.attr("fill", "#52525b") // gray-600
			.attr("font-size", 10)
			.text("SIGNAL STRENGTH (-/+)");

		// Zone Annotations (Background)
		// Bullish Zone (Top Right)
		svg
			.append("text")
			.attr("x", w - margin.right - 10)
			.attr("y", margin.top + 10)
			.attr("text-anchor", "end")
			.attr("fill", "#4ade80") // green-400
			.attr("opacity", 0.1)
			.attr("font-size", 24)
			.attr("font-weight", "bold")
			.text("STRONG BUY");

		// Bearish Zone (Bottom Right)
		svg
			.append("text")
			.attr("x", w - margin.right - 10)
			.attr("y", h - margin.bottom - 10)
			.attr("text-anchor", "end")
			.attr("fill", "#f87171") // red-400
			.attr("opacity", 0.1)
			.attr("font-size", 24)
			.attr("font-weight", "bold")
			.text("STRONG SELL");

		// Tooltip Container
		const tooltip = d3
			.select(containerRef.current)
			.selectAll(".scatter-tooltip")
			.data([null])
			.join("div")
			.attr("class", "scatter-tooltip")
			.style("position", "absolute")
			.style("visibility", "hidden")
			.style("background", "var(--color-dark-800)")
			.style("border", "1px solid var(--color-dark-600)")
			.style("padding", "8px")
			.style("border-radius", "8px")
			.style("font-size", "11px")
			.style("z-index", 10)
			.style("pointer-events", "none")
			.style("box-shadow", "0 4px 6px rgba(0,0,0,0.5)");

		// Simulation nodes
		// Map data to simulation nodes (preserving original data)
		const simulationNodes = data.map((d) => {
			const yVal =
				d.potentialDirection === "DOWN" ? -(d.score || 0) : d.score || 0;
			return {
				...d,
				targetX: x(d.confidence || 0),
				targetY: y(yVal),
				x: x(d.confidence || 0) + (Math.random() - 0.5) * 50, // Initial jitter
				y: y(yVal) + (Math.random() - 0.5) * 50,
			};
		});

		// Node Group
		const nodeGroup = svg.append("g");

		// Simulation
		const simulation = d3
			.forceSimulation(simulationNodes as any)
			.force("x", d3.forceX((d: any) => d.targetX).strength(0.8)) // Pull strongly to X (Confidence)
			.force("y", d3.forceY((d: any) => d.targetY).strength(0.5)) // Pull moderately to Y
			.force("collide", d3.forceCollide(8)) // Prevent overlap radius 8 (bubbles are radius 6)
			.stop();

		// Run simulation tick manually for static render speed or use timer
		for (let i = 0; i < 120; ++i) simulation.tick();

		// Render Nodes based on simulation end state
		const nodes = nodeGroup
			.selectAll("g")
			.data(simulationNodes)
			.join("g")
			.attr("transform", (d: any) => `translate(${d.x},${d.y})`)
			.on("click", (_event, d) => onSelect(d))
			.style("cursor", "pointer");

		// Circles
		nodes
			.append("circle")
			.attr("r", 6)
			.attr(
				"fill",
				(d) =>
					d.potentialDirection === "UP"
						? "#4ade80" // green-400
						: d.potentialDirection === "DOWN"
							? "#f87171" // red-400
							: "#52525b", // gray-600
			)
			.attr("stroke", "#18181b") // dark-900? or black
			.attr("stroke-width", 2)
			.attr("opacity", 0.8)
			.on("mouseover", function (_event, d) {
				d3.select(this)
					.transition()
					.duration(200)
					.attr("r", 12)
					.attr("opacity", 1)
					.attr("stroke", "#fff");

				// Show tooltip
				tooltip.style("visibility", "visible").html(`
          <div class="flex items-center justify-between gap-4 mb-2">
            <span class="font-bold text-sm text-gray-100">${d.symbol}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded ${d.potentialDirection === "UP" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}">${d.potentialDirection}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-gray-500">
            <span>Confidence:</span>
            <span class="text-right text-gray-200 font-numeric">${d.confidence?.toFixed(1)}%</span>
            <span>Score:</span>
            <span class="text-right text-gray-200 font-numeric">${d.score?.toFixed(2)}</span>
            <span>Price:</span>
            <span class="text-right text-gray-200 font-numeric">$${d.currentPrice?.toLocaleString()}</span>
          </div>
        `);
			})
			.on("mousemove", (event) => {
				// Position tooltip near mouse
				const [x, y] = d3.pointer(event, containerRef.current);
				// Adjust to not go offscreen
				const tooltipW = 150;
				const tooltipH = 80;

				let left = x + 15;
				let top = y + 15;

				if (left + tooltipW > w) left = x - tooltipW - 10;
				if (top + tooltipH > h) top = y - tooltipH - 10;

				tooltip.style("left", `${left}px`).style("top", `${top}px`);
			})
			.on("mouseout", function () {
				d3.select(this)
					.transition()
					.duration(200)
					.attr("r", 6)
					.attr("opacity", 0.8)
					.attr("stroke", "#18181b");

				tooltip.style("visibility", "hidden");
			});

		// Labels
		nodes
			.append("text")
			.attr("dy", -10)
			.attr("text-anchor", "middle")
			.attr("fill", "#e4e4e7") // gray-200
			.attr("font-size", 10)
			.attr("font-weight", "bold")
			.style("pointer-events", "none")
			.style("text-shadow", "0 1px 2px black")
			.text((d) => d.symbol);

		// Memory cleanup
		return () => {
			simulation.stop();
		};
	}, [data, height, onSelect]);

	return (
		<div
			ref={containerRef}
			className="w-full relative bg-dark-400/30 border border-dark-700 rounded-xl overflow-hidden group hover:border-dark-600 transition-colors"
		>
			{/* Decorators */}
			<div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-dark-600" />
			<div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-dark-600" />
			<div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-dark-600" />
			<div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-dark-600" />

			<svg ref={svgRef} width="100%" height={height} className="block" />
			{data.length === 0 && (
				<div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs font-mono">
					Waiting for signals...
				</div>
			)}
		</div>
	);
};

export default PredictionScatterPlot;
