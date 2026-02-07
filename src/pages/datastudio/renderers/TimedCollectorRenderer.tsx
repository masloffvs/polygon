import type React from "react";
import { useEffect, useState } from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

interface PendingItem {
	source: string;
	timestamp: string;
	dayProgress: number;
	hourOfDay: number;
	dataPreview: string;
}

interface Stats {
	pendingCount: number;
	totalCount: number;
	lastFlushBatchId: string | null;
	nextFlushHours: number[];
	dropInterval: number;
	currentUTCHour: number;
	currentUTCMinute: number;
	isWithinFlushWindow: boolean;
}

const TimedCollectorRenderer: React.FC<NodeRendererProps> = ({
	data,
	nodeData,
}) => {
	const [stats, setStats] = useState<Stats | null>(null);
	const [pending, setPending] = useState<PendingItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = async () => {
		try {
			const [statsRes, pendingRes] = await Promise.all([
				fetch(`/api/datastudio/timed-collector/stats?id=${nodeData.id}`),
				fetch(
					`/api/datastudio/timed-collector/pending?id=${nodeData.id}&limit=5`,
				),
			]);

			if (statsRes.ok) {
				setStats(await statsRes.json());
			}
			if (pendingRes.ok) {
				const p = await pendingRes.json();
				setPending(p.pending || []);
			}
			setError(null);
		} catch (_err) {
			setError("Failed to load data");
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
		const interval = setInterval(fetchData, 30000); // Refresh every 30s
		return () => clearInterval(interval);
	}, [fetchData]);

	// Handle live stats from process() output
	useEffect(() => {
		if (data?.stats?.value) {
			const liveStats = data.stats.value;
			setStats((prev) =>
				prev ? { ...prev, pendingCount: liveStats.pendingCount } : null,
			);
		}
	}, [data?.stats?.value]);

	if (isLoading) {
		return (
			<div className="p-3 text-xs text-gray-500 italic text-center">
				Loading collector stats...
			</div>
		);
	}

	if (error || !stats) {
		return (
			<div className="p-3 text-xs text-red-400 text-center">
				{error || "No stats available"}
			</div>
		);
	}

	const formatHour = (h: number) => `${h.toString().padStart(2, "0")}:00`;

	return (
		<div className="flex flex-col gap-2 p-2 w-full min-w-[220px]">
			{/* Header Status */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div
						className={`w-2 h-2 rounded-full ${
							stats.isWithinFlushWindow
								? "bg-yellow-400 animate-pulse"
								: "bg-lime-500"
						}`}
					/>
					<span className="text-xs font-medium text-gray-300">
						{stats.isWithinFlushWindow ? "Flush Window" : "Collecting"}
					</span>
				</div>
				<span className="text-[10px] text-gray-500 font-mono">
					{formatHour(stats.currentUTCHour)} UTC
				</span>
			</div>

			{/* Stats Grid */}
			<div className="grid grid-cols-2 gap-2 text-xs">
				<div className="bg-dark-900/50 rounded p-2">
					<div className="text-gray-500 text-[9px] uppercase">Pending</div>
					<div className="text-purple-400 font-mono text-lg">
						{stats.pendingCount}
					</div>
				</div>
				<div className="bg-dark-900/50 rounded p-2">
					<div className="text-gray-500 text-[9px] uppercase">Interval</div>
					<div className="text-lime-400 font-mono text-lg">
						{stats.dropInterval}h
					</div>
				</div>
			</div>

			{/* Next Flush Hours */}
			<div className="bg-dark-900/30 rounded p-2">
				<div className="text-gray-500 text-[9px] uppercase mb-1">
					Flush Schedule (UTC)
				</div>
				<div className="flex flex-wrap gap-1">
					{stats.nextFlushHours.map((h) => (
						<span
							key={h}
							className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
								h === stats.currentUTCHour
									? "bg-yellow-500/30 text-yellow-300"
									: "bg-gray-800 text-gray-400"
							}`}
						>
							{formatHour(h)}
						</span>
					))}
				</div>
			</div>

			{/* Day Progress Bar */}
			<div className="bg-dark-900/30 rounded p-2">
				<div className="flex justify-between text-[9px] text-gray-500 mb-1">
					<span>Day Progress</span>
					<span>
						{(
							(stats.currentUTCHour * 60 + stats.currentUTCMinute) /
							14.4
						).toFixed(1)}
						%
					</span>
				</div>
				<div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
					<div
						className="h-full bg-lime-500 transition-all"
						style={{
							width: `${(stats.currentUTCHour * 60 + stats.currentUTCMinute) / 14.4}%`,
						}}
					/>
				</div>
			</div>

			{/* Recent Pending Items */}
			{pending.length > 0 && (
				<div className="bg-dark-900/30 rounded p-2">
					<div className="text-gray-500 text-[9px] uppercase mb-1">
						Recent Items ({pending.length})
					</div>
					<div className="space-y-1 max-h-[80px] overflow-y-auto custom-scrollbar">
						{pending.map((item, i) => (
							<div
								key={i}
								className="text-[9px] flex justify-between items-center bg-gray-900/50 rounded px-1.5 py-1"
							>
								<span className="text-purple-300 font-mono truncate max-w-[100px]">
									{item.source}
								</span>
								<span className="text-gray-600">
									{new Date(item.timestamp).toLocaleTimeString()}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Last Flush Info */}
			{stats.lastFlushBatchId && (
				<div className="text-[9px] text-gray-600 text-center truncate">
					Last batch: {stats.lastFlushBatchId.slice(0, 8)}...
				</div>
			)}
		</div>
	);
};

registerRenderer("timed-collector", TimedCollectorRenderer);
export default TimedCollectorRenderer;
