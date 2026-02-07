import type React from "react";
import { useEffect, useState } from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

interface BufferState {
	count: number;
	maxSize: number;
	percentFull: number;
}

/**
 * TriggeredDrop Renderer
 *
 * Shows buffer status - how many items are collected and waiting for trigger.
 */
const TriggeredDropRenderer: React.FC<NodeRendererProps> = ({
	data,
	nodeData,
}) => {
	const [bufferState, setBufferState] = useState<BufferState | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	// Fetch buffer state from API
	const fetchState = async () => {
		try {
			const res = await fetch(
				`/api/datastudio/triggered-drop/state?id=${nodeData.id}`,
			);
			if (res.ok) {
				setBufferState(await res.json());
			}
		} catch (_err) {
			// Ignore errors
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchState();
		const interval = setInterval(fetchState, 2000); // Refresh every 2s
		return () => clearInterval(interval);
	}, [fetchState]);

	// Get last batch info from output (when triggered)
	const batchData = data?.batch?.value;
	const lastBatchSize = Array.isArray(batchData) ? batchData.length : 0;
	const triggerData = data?.trigger?.value;
	const wasTriggered = triggerData !== undefined;

	// Settings
	const maxBufferSize =
		bufferState?.maxSize || nodeData.settings?.maxBufferSize || 1000;
	const passEmpty = nodeData.settings?.passEmptyOnTrigger || false;
	const currentCount = bufferState?.count ?? 0;
	const percentFull = bufferState?.percentFull ?? 0;

	return (
		<div className="flex flex-col gap-2 p-3 w-full min-w-[200px]">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div
						className={`w-2 h-2 rounded-full ${
							wasTriggered ? "bg-yellow-400 animate-pulse" : "bg-lime-500"
						}`}
					/>
					<span className="text-xs font-medium text-white/80">
						{wasTriggered ? "Triggered!" : "Collecting..."}
					</span>
				</div>
			</div>

			{/* Buffer status */}
			<div className="bg-white/5 rounded p-2">
				<div className="flex justify-between items-center mb-1">
					<span className="text-xs text-white/60">Buffer:</span>
					<span className="text-sm font-bold text-lime-400">
						{isLoading ? "..." : currentCount} / {maxBufferSize}
					</span>
				</div>
				{/* Progress bar */}
				<div className="w-full h-1.5 bg-white/10 rounded overflow-hidden">
					<div
						className={`h-full transition-all ${
							percentFull > 80 ? "bg-amber-500" : "bg-lime-500"
						}`}
						style={{ width: `${Math.min(100, percentFull)}%` }}
					/>
				</div>
			</div>

			{/* Last batch info */}
			{wasTriggered && (
				<div className="bg-amber-500/10 border border-amber-500/30 rounded p-2">
					<div className="text-xs text-white/60 mb-1">Last flush:</div>
					<div className="text-lg font-bold text-amber-400">
						{lastBatchSize} items
					</div>
				</div>
			)}

			{/* Settings summary */}
			<div className="text-xs text-white/40 flex gap-2">
				<span>Empty flush: {passEmpty ? "Yes" : "No"}</span>
			</div>
		</div>
	);
};

registerRenderer("triggered-drop", TriggeredDropRenderer);
export default TriggeredDropRenderer;
