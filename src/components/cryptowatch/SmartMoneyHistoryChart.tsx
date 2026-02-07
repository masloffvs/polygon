import * as d3 from "d3";
import { useEffect, useRef, useState } from "react";

interface HistoryDataPoint {
	windowStart: Date;
	windowEnd?: Date; // Added optional end time
	accuracy: number; // 0-100
	longRatio: number; // 0-100
	volume: number;
}

interface SmartMoneyHistoryChartProps {
	data: HistoryDataPoint[];
	traderData?: Record<string, { date: Date; accuracy: number }[]>;
	assetData?: Record<
		string,
		{ date: Date; accuracy: number; price?: number }[]
	>;
	width?: number; // Optional, can be controlled by parent container
	height?: number; // Optional, controlled by container
	selectedAsset?: string;
}

export const SmartMoneyHistoryChart = ({
	data,
	traderData,
	assetData,
	width = 800,
	height: initialHeight = 400,
	selectedAsset,
}: SmartMoneyHistoryChartProps) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const [containerWidth, setContainerWidth] = useState(width);
	const [containerHeight, setContainerHeight] = useState(initialHeight);

	// Responsive dimensions
	useEffect(() => {
		if (!containerRef.current) return;
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setContainerWidth(entry.contentRect.width);
				// Only update height if logic dictates filling parent
				// If parent has fixed height, this will effectively make it fill
				if (entry.contentRect.height > 0) {
					setContainerHeight(entry.contentRect.height);
				}
			}
		});
		resizeObserver.observe(containerRef.current);
		return () => resizeObserver.disconnect();
	}, []);

	useEffect(() => {
		if (!svgRef.current || !data || data.length === 0) return;

		const w = containerWidth;
		const h = containerHeight; // Use state height

		// Clear previous
		d3.select(svgRef.current).selectAll("*").remove();
		// Also clear tooltip if it exists attached to container
		d3.select(containerRef.current).select(".chart-tooltip").remove();

		const margin = { top: 20, right: 40, bottom: 30, left: 40 };
		const chartW = w - margin.left - margin.right;
		const chartH = h - margin.top - margin.bottom;

		const svg = d3
			.select(svgRef.current)
			.attr("width", w)
			.attr("height", h)
			.append("g")
			.attr("transform", `translate(${margin.left},${margin.top})`);

		// CLIP PATH for Zooming
		svg
			.append("defs")
			.append("clipPath")
			.attr("id", "clip")
			.append("rect")
			.attr("width", chartW)
			.attr("height", chartH);

		// Create a group for zoomed content
		const chartBody = svg.append("g").attr("clip-path", "url(#clip)");

		// Scales
		const x = d3
			.scaleTime()
			.domain(d3.extent(data, (d) => d.windowStart) as [Date, Date])
			.range([0, chartW]);

		const y = d3.scaleLinear().domain([0, 100]).range([chartH, 0]);

		// Volume Scale (secondary)
		const yVol = d3
			.scaleLinear()
			.domain([0, d3.max(data, (d) => d.volume) || 0])
			.range([chartH, chartH * 0.7]); // Bottom 30% for volume

		// Grid lines
		const makeYGridlines = () => d3.axisLeft(y).ticks(5);

		// Add the gridlines (Static, not zoomed usually, but vertical lines might need to zoom? No, only Y grid)
		svg
			.append("g")
			.attr("class", "grid")
			.call(
				makeYGridlines()
					.tickSize(-chartW)
					.tickFormat(() => ""),
			)
			.attr("stroke", "#262626") // neutral-800
			.attr("stroke-dasharray", "3,3")
			.style("opacity", 0.3)
			.select(".domain")
			.remove();

		// Axes
		const xAxis = d3
			.axisBottom(x)
			.ticks(5)
			.tickFormat(d3.timeFormat("%b %d %H:%M") as any);

		const xAxisGroup = svg
			.append("g")
			.attr("class", "x-axis")
			.attr("transform", `translate(0,${chartH})`)
			.call(xAxis);

		xAxisGroup.select(".domain").remove();
		xAxisGroup.selectAll("text").style("color", "#9ca3af"); // gray-400

		svg
			.append("g")
			.call(
				d3
					.axisLeft(y)
					.ticks(5)
					.tickFormat((d) => `${d}%`),
			)
			.attr("color", "#9ca3af") // gray-400
			.select(".domain")
			.remove();

		// Volume Bars (Dynamic Width)
		const barWidth = Math.max(2, (chartW / data.length) * 0.6);

		const bars = chartBody
			.selectAll(".bar")
			.data(data)
			.enter()
			.append("rect")
			.attr("class", "bar")
			.attr("fill", "#3b82f6") // blue-500
			.attr("x", (d) => x(d.windowStart) - barWidth / 2)
			.attr("width", barWidth)
			.attr("y", (d) => yVol(d.volume))
			.attr("height", (d) => chartH - yVol(d.volume))
			.attr("opacity", 0.15)
			.attr("rx", 1);

		// Draw Asset Lines (if provided) - Replaces Global Average focus
		const colorScale = d3.scaleOrdinal(d3.schemeSpectral[11]);

		// Store asset paths for zooming ref
		const assetPaths: any[] = [];
		const assetLabels: any[] = [];
		const assetDots: any[] = [];

		if (assetData) {
			Object.entries(assetData).forEach(([asset, points], _i) => {
				if (points.length < 2) return;

				// If selectedAsset is set, skip others - or dim them
				const isSelected = selectedAsset && selectedAsset === asset;
				const _nothingSelected = !selectedAsset || selectedAsset === "ALL";

				if (selectedAsset && !isSelected) return;

				const assetLine = d3
					.line<{ date: Date; accuracy: number }>()
					.x((d) => x(d.date))
					.y((d) => y(d.accuracy))
					.curve(d3.curveLinear);

				// Specific colors for top assets
				let color = colorScale(asset);
				if (asset === "BTC") color = "#F7931A";
				else if (asset === "ETH") color = "#627EEA";
				else if (asset === "SOL") color = "#14F195";

				const path = chartBody
					.append("path")
					.datum(points)
					.attr("class", "asset-line")
					.attr("fill", "none")
					.attr("stroke", color)
					.attr("stroke-width", isSelected ? 3 : 2)
					.attr("opacity", isSelected ? 1 : 0.9)
					.attr("d", assetLine);

				assetPaths.push({ path, lineGen: assetLine });

				// Label at the end of the line
				const lastPoint = points[points.length - 1];
				if (lastPoint) {
					const label = chartBody
						.append("text")
						.datum(lastPoint) // Bind data for zoom update
						.attr("class", "asset-label")
						.attr("x", x(lastPoint.date) + 5)
						.attr("y", y(lastPoint.accuracy))
						.text(asset)
						.attr("fill", color)
						.style("font-size", isSelected ? "12px" : "10px")
						.style("font-family", "CrashNumberingGothic")
						.style("font-weight", isSelected ? "bold" : "normal")
						.attr("alignment-baseline", "middle");

					assetLabels.push(label);
				}

				// Add percentage labels to vertices if selected
				if (isSelected) {
					const labels = chartBody
						.selectAll(`.label-${asset}`)
						.data(points)
						.enter()
						.append("text")
						.attr("class", "data-label")
						.attr("x", (d) => x(d.date))
						.attr("y", (d) => y(d.accuracy) - 10)
						.text((d) => `${d.accuracy.toFixed(0)}%`)
						.attr("text-anchor", "middle")
						.attr("fill", color)
						.style("font-size", "9px")
						.style("font-family", "CrashNumberingGothic")
						.style("font-weight", "bold");

					assetLabels.push(labels);

					// Also add dots for vertices
					const dots = chartBody
						.selectAll(`.dot-${asset}`)
						.data(points)
						.enter()
						.append("circle")
						.attr("class", "data-dot")
						.attr("cx", (d) => x(d.date))
						.attr("cy", (d) => y(d.accuracy))
						.attr("r", 2)
						.attr("fill", color);

					assetDots.push(dots);
				}
			});
		}

		// Trader Lines (Background noise)
		if (traderData) {
			Object.values(traderData).forEach((points) => {
				if (points.length < 2) return;
				const traderLine = d3
					.line<{ date: Date; accuracy: number }>()
					.x((d) => x(d.date))
					.y((d) => y(d.accuracy))
					.curve(d3.curveLinear);

				chartBody
					.append("path")
					.datum(points)
					.attr("class", "trader-line")
					.attr("fill", "none")
					.attr("stroke", "#404040") // neutral-700
					.attr("stroke-width", 0.5)
					.attr("opacity", 0.2)
					.attr("d", traderLine);
			});
		}

		// Global Average (now just a subtle reference, or removed if assets are main focus)
		// User asked "instead of single green line", so let's make it dashed or very subtle
		const line = d3
			.line<HistoryDataPoint>()
			.x((d) => x(d.windowStart))
			.y((d) => y(d.accuracy))
			.curve(d3.curveLinear);

		// Draw Global Line (Subtle)
		const globalPath = chartBody
			.append("path")
			.datum(data)
			.attr("class", "line")
			.attr("fill", "none")
			.attr("stroke", "#9ca3af") // gray-400
			.attr("stroke-width", 1)
			.attr("stroke-dasharray", "2,2")
			.attr("opacity", 0.3)
			.attr("d", line);

		// 50% Reference Line
		svg
			.append("line")
			.attr("x1", 0)
			.attr("x2", chartW)
			.attr("y1", y(50))
			.attr("y2", y(50))
			.attr("stroke", "#525252")
			.attr("stroke-dasharray", "4,4")
			.attr("stroke-width", 1);

		// Interaction Layer
		const focus = svg.append("g").style("display", "none");

		// Window Highlight Rectangle
		focus
			.append("rect")
			.attr("id", "focus-window-rect")
			.attr("y", 0)
			.attr("height", chartH)
			.attr("fill", "#3b82f6") // blue-500
			.attr("opacity", 0.1)
			.style("pointer-events", "none");

		focus
			.append("line")
			.attr("id", "focus-line-x")
			.attr("class", "focus-line")
			.style("stroke", "#9ca3af") // gray-400
			.style("stroke-dasharray", "3,3")
			.style("opacity", 0.5)
			.attr("y1", 0)
			.attr("y2", chartH);

		focus
			.append("circle")
			.attr("r", 4)
			.attr("fill", "#fff")
			.attr("stroke", "#4ade80") // green-400
			.attr("stroke-width", 2);

		// Use a simpler tooltip strategy: standard div in the container
		const tooltip = d3
			.select(containerRef.current)
			.append("div")
			.attr("class", "chart-tooltip")
			.style("position", "absolute")
			.style("visibility", "hidden")
			.style("background", "#1f2937") // dark-800
			.style("border", "1px solid #374151") // dark-700
			.style("padding", "8px")
			.style("border-radius", "4px")
			.style("font-size", "12px")
			.style("pointer-events", "none")
			.style("box-shadow", "0 4px 12px rgba(0,0,0,0.5)")
			.style("z-index", "10");

		// ZOOM Behavior
		const zoom = d3
			.zoom()
			.scaleExtent([1, 10]) // 1x to 10x zoom
			.extent([
				[0, 0],
				[chartW, chartH],
			])
			.on("zoom", updateChart);

		// Invisible overlay for Zoom/Interaction
		const overlay = svg
			.append("rect")
			.attr("class", "overlay")
			.attr("width", chartW)
			.attr("height", chartH)
			.style("fill", "none")
			.style("pointer-events", "all")
			.call(zoom as any) // Attach zoom
			.on("mouseover", () => {
				focus.style("display", null);
				tooltip.style("visibility", "visible");
			})
			.on("mouseout", () => {
				focus.style("display", "none");
				tooltip.style("visibility", "hidden");
			})
			.on("mousemove", (event) => {
				// Need to handle mousemove with zoom transform!
				// We get the current transform from the element (the overlay)
				const transform = d3.zoomTransform(overlay.node() as Element);
				const newX = transform.rescaleX(x);

				const bisectDate = d3.bisector(
					(d: HistoryDataPoint) => d.windowStart,
				).left;

				// Invert X using NEW scale
				const mouseX = d3.pointer(event)[0];
				const x0 = newX.invert(mouseX);

				const i = bisectDate(data, x0, 1);
				const d0 = data[i - 1];
				const d1 = data[i];
				let d = d0;
				if (d1 && d0) {
					d =
						x0.getTime() - d0.windowStart.getTime() >
						d1.windowStart.getTime() - x0.getTime()
							? d1
							: d0;
				}

				if (!d) return;

				// Highlight Window
				if (d.windowEnd) {
					const startX = newX(d.windowStart);
					const endX = newX(d.windowEnd);
					const width = Math.max(1, endX - startX);

					focus
						.select("#focus-window-rect")
						.attr("x", startX)
						.attr("width", width)
						.attr("display", null);
				} else {
					// Fallback if no windowEnd: try to guess width or hide
					focus.select("#focus-window-rect").attr("display", "none");
				}

				// We reset the group transform to act in screen space? No, focus group is not zoomed.
				// It stays in screen coords. So we use newX(d.date)

				// Move Line
				focus
					.select("#focus-line-x")
					.attr("transform", `translate(${newX(d.windowStart)}, 0)`)
					.attr("y1", 0)
					.attr("y2", chartH);

				// Move Circle
				focus
					.select("circle")
					.attr("cx", newX(d.windowStart))
					.attr("cy", y(d.accuracy));

				// Tooltip position
				const [containerX, containerY] = d3.pointer(
					event,
					containerRef.current,
				);

				// Find asset data for this point if selected
				let assetPrice: number | undefined;
				let assetAccuracy: number | undefined;

				if (assetData && selectedAsset) {
					const points = assetData[selectedAsset];
					if (points) {
						// Simple find by matching time (approx)
						const point = points.find(
							(p) =>
								Math.abs(p.date.getTime() - d.windowStart.getTime()) < 600000,
						); // 10 mins tolerance
						if (point) {
							assetPrice = point.price;
							assetAccuracy = point.accuracy;
						}
					}
				}

				let content = `
                <div style="color:#9ca3af; margin-bottom:4px; white-space:nowrap; font-family:CrashNumberingGothic;">${d3.timeFormat("%b %d %H:%M")(d.windowStart)}</div>
        `;

				if (selectedAsset && assetAccuracy !== undefined) {
					content += `
                <div style="font-weight:bold; color:#f3f4f6; font-family:CrashNumberingGothic;">${selectedAsset} Acc: <span style="color:${assetAccuracy >= 50 ? "#4ade80" : "#f87171"}">${assetAccuracy.toFixed(1)}%</span></div>
             `;
					if (assetPrice) {
						content += `<div style="color:#3b82f6; font-family:CrashNumberingGothic;">${selectedAsset} Price: $${assetPrice.toLocaleString()}</div>`;
					}
				} else {
					// Fallback to global
					content += `
                <div style="font-weight:bold; color:#f3f4f6; font-family:CrashNumberingGothic;">Avg Accuracy: <span style="color:${d.accuracy >= 50 ? "#4ade80" : "#f87171"}">${d.accuracy.toFixed(1)}%</span></div>
             `;
				}

				content += `<div style="color:#9ca3af; font-family:CrashNumberingGothic;">Vol: $${(d.volume / 1000).toFixed(1)}K</div>`;

				tooltip
					.html(content)
					.style("top", `${Math.min(containerY + 10, h - 80)}px`) // Avoid going off bottom using h (container height)
					.style("left", `${Math.min(containerX + 15, w - 120)}px`); // Avoid going off right
			});

		function updateChart(event: any) {
			// recover the new scale
			const newX = event.transform.rescaleX(x);

			// update axes with these new boundaries
			xAxisGroup.call(
				d3
					.axisBottom(newX)
					.ticks(5)
					.tickFormat(d3.timeFormat("%b %d %H:%M") as any),
			);
			xAxisGroup.select(".domain").remove();
			xAxisGroup.selectAll("text").style("color", "#9ca3af");

			// update bars
			bars
				.attr(
					"x",
					(d) => newX(d.windowStart) - (barWidth * event.transform.k) / 2,
				) // scale width?
				.attr("width", barWidth * event.transform.k); // Makes bars wider on zoom

			// update asset lines
			assetPaths.forEach(({ path, lineGen }) => {
				path.attr(
					"d",
					lineGen.x((d: any) => newX(d.date)).y((d: any) => y(d.accuracy)),
				);
			});

			// update asset labels (text)
			assetLabels.forEach((labelSelection) => {
				// Handle both single selections and groups
				if (labelSelection.size() > 1 || labelSelection.data().length > 1) {
					labelSelection.attr("x", (d: any) => newX(d.date));
				} else {
					labelSelection.attr("x", (d: any) => newX(d.date) + 5);
				}
			});

			// update dots
			assetDots.forEach((dotSelection) => {
				dotSelection.attr("cx", (d: any) => newX(d.date));
			});

			// update trader lines (if any)
			chartBody.selectAll(".trader-line").attr(
				"d",
				(d: any) =>
					d3
						.line()
						.x((p: any) => newX(p.date))
						.y((p: any) => y(p.accuracy))
						.curve(d3.curveLinear)(d) as string,
			);

			// update global line
			globalPath.attr(
				"d",
				d3
					.line<HistoryDataPoint>()
					.x((d) => newX(d.windowStart))
					.y((d) => y(d.accuracy))
					.curve(d3.curveLinear),
			);
		}
	}, [
		data,
		traderData,
		containerWidth,
		containerHeight,
		assetData,
		selectedAsset,
	]);

	return (
		<div
			ref={containerRef}
			className="w-full h-full relative"
			style={{ minHeight: "300px" }}
		>
			<svg ref={svgRef} />
		</div>
	);
};
