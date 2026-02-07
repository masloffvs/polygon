import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

// Helper to flatten nested objects into dot-notation keys
const flattenObject = (obj: any, prefix = ""): Record<string, any> => {
	return Object.keys(obj).reduce((acc: any, k) => {
		const pre = prefix.length ? `${prefix}.` : "";
		if (
			typeof obj[k] === "object" &&
			obj[k] !== null &&
			!Array.isArray(obj[k]) &&
			!(obj[k] instanceof Date)
		) {
			Object.assign(acc, flattenObject(obj[k], pre + k));
		} else {
			acc[pre + k] = obj[k];
		}
		return acc;
	}, {});
};

const TableVizRenderer: React.FC<NodeRendererProps> = ({ data, nodeData }) => {
	const [restoredData, setRestoredData] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);

	// Check if we have live data
	const hasLiveOrServerRestoredData = !!data?.data?.value;

	useEffect(() => {
		if (hasLiveOrServerRestoredData) return;

		let isMounted = true;
		const fetchState = async () => {
			setIsLoading(true);
			try {
				// Reuse the same endpoint since we used the same redis key pattern
				const res = await fetch(`/api/datastudio/redis-memo?id=${nodeData.id}`);
				if (res.ok && res.status !== 204) {
					const json = await res.json();
					if (isMounted) {
						setRestoredData({
							value: json.value,
							restored: true,
							timestamp: json.timestamp,
						});
					}
				}
			} catch (err) {
				console.error("TableViz restore error", err);
			} finally {
				if (isMounted) setIsLoading(false);
			}
		};

		fetchState();
		return () => {
			isMounted = false;
		};
	}, [nodeData.id, hasLiveOrServerRestoredData]);

	const effectivePacket = data?.data?.value ? data.data : restoredData;
	const rawValue = effectivePacket?.value;

	// Process data for table
	const tableData = useMemo(() => {
		if (!rawValue) return [];

		// Normalize to array
		const arr = Array.isArray(rawValue) ? rawValue : [rawValue];

		// Flatten all items
		return arr.map((item) =>
			typeof item === "object" && item !== null
				? flattenObject(item)
				: { value: item },
		);
	}, [rawValue]);

	const columns = useMemo(() => {
		if (tableData.length === 0) return [];
		// Collect all unique keys from all rows to handle heterogeneous objects
		const keys = new Set<string>();
		tableData.forEach((row) => Object.keys(row).forEach((k) => keys.add(k)));
		return Array.from(keys);
	}, [tableData]);

	if (!rawValue) {
		return (
			<div className="p-3 text-xs text-gray-500 italic text-center h-full flex items-center justify-center">
				{isLoading ? "Loading table..." : "Empty"}
			</div>
		);
	}

	const RenderTable = ({ rows, limit }: { rows: any[]; limit?: number }) => {
		const displayRows = limit ? rows.slice(0, limit) : rows;

		return (
			<div className="w-full overflow-auto custom-scrollbar">
				<table className="w-full text-left border-collapse">
					<thead>
						<tr>
							{columns.map((col) => (
								<th
									key={col}
									className="p-2 text-[10px] text-gray-400 font-medium whitespace-nowrap sticky top-0 bg-dark-800/50 z-10 first:rounded-l-md last:rounded-r-md"
								>
									{col}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{displayRows.map((row, idx) => (
							<tr
								key={idx}
								className="odd:bg-dark-800/20 hover:bg-dark-700/40 transition-colors"
							>
								{columns.map((col) => (
									<td
										key={col}
										className="p-2 text-[10px] text-gray-300 font-mono whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis"
									>
										{String(row[col] ?? "")}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		);
	};

	return (
		<>
			<div className="flex flex-col h-full w-full min-w-[250px] min-h-[150px]">
				<div className="flex justify-between items-center p-2 border-b border-white/5 bg-dark-900/30">
					<div className="flex items-center gap-2">
						<span className="text-[10px] bg-lime-500/10 text-lime-400 px-1.5 py-0.5 rounded">
							{tableData.length} rows
						</span>
						{effectivePacket?.restored && (
							<span className="text-[9px] text-gray-500 italic">Restored</span>
						)}
					</div>
					<button
						onClick={() => setIsExpanded(true)}
						className="text-[10px] text-gray-400 hover:text-white hover:bg-white/10 px-1.5 py-0.5 rounded transition"
					>
						Expand
					</button>
				</div>

				<div className="flex-1 overflow-hidden relative bg-dark-900/20">
					<RenderTable rows={tableData} limit={5} />
					{tableData.length > 5 && (
						<div className="absolute bottom-0 w-full h-6 bg-[#0a0a0a]/90 pointer-events-none" />
					)}
				</div>
			</div>

			{/* Expanded Modal Overlay */}
			{isExpanded && (
				<div
					className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-8"
					onClick={() => setIsExpanded(false)}
				>
					<div
						className="bg-[#0f0f0f] w-full h-full rounded-xl shadow-2xl flex flex-col overflow-hidden"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex justify-between items-center p-4 border-b border-white/5 bg-[#141414]">
							<h3 className="text-lime-400 font-medium">Data Inspector</h3>
							<button
								onClick={() => setIsExpanded(false)}
								className="text-gray-400 hover:text-white"
							>
								Close
							</button>
						</div>
						<div className="flex-1 overflow-auto p-4 custom-scrollbar">
							<RenderTable rows={tableData} />
						</div>
						<div className="p-2 border-t border-white/5 bg-[#141414] text-[10px] text-gray-500 flex justify-between">
							<span>Total Rows: {tableData.length}</span>
							<span>
								Synced: {(() => {
									try {
										const ts = effectivePacket?.timestamp;
										if (!ts || typeof ts !== "number") return "N/A";
										return new Date(ts).toLocaleString();
									} catch {
										return "N/A";
									}
								})()}
							</span>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

registerRenderer("table-viz", TableVizRenderer);
export default TableVizRenderer;
