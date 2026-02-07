import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const ApiTriggerRenderer: React.FC<NodeRendererProps> = ({
	data,
	nodeData,
}) => {
	const result = data?.data?.value;
	const settings = nodeData?.settings || {};

	const triggerKey = settings.triggerKey || "";
	const description = settings.description || "";

	// Generate the curl command for easy testing
	const _curlExample = `curl -X POST /api/datastudio/trigger \\
  -H "Content-Type: application/json" \\
  -d '{"key": "${triggerKey || "your-key"}", "payload": {...}}'`;

	return (
		<div className="flex flex-col gap-2 p-2 w-full min-w-[200px]">
			{/* Trigger Key Display */}
			<div className="flex items-center gap-2">
				<div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
				<span className="text-[10px] text-gray-400 uppercase tracking-wide">
					Listening
				</span>
			</div>

			{/* Key Badge */}
			<div className="bg-dark-900/50 rounded p-2">
				<div className="text-[9px] text-gray-500 uppercase mb-1">
					Trigger Key
				</div>
				<div className="text-xs text-amber-400 font-mono">
					{triggerKey || (
						<span className="text-gray-600 italic">* (all events)</span>
					)}
				</div>
			</div>

			{/* Description */}
			{description && (
				<div className="text-[10px] text-gray-500 line-clamp-2">
					{description}
				</div>
			)}

			{/* Last Trigger */}
			{result && (
				<div className="bg-dark-900/50 rounded p-2">
					<div className="text-[9px] text-gray-500 uppercase mb-1">
						Last Trigger
					</div>
					<div className="text-[10px] text-gray-300 font-mono truncate">
						{result.triggeredAt ||
							new Date(result.timestamp).toLocaleTimeString()}
					</div>
					{result.payload && (
						<div className="text-[9px] text-gray-600 mt-1 truncate">
							{typeof result.payload === "object"
								? `${JSON.stringify(result.payload).slice(0, 50)}...`
								: String(result.payload)}
						</div>
					)}
				</div>
			)}

			{/* No triggers yet */}
			{!result && (
				<div className="text-[10px] text-gray-600 italic text-center">
					Waiting for trigger...
				</div>
			)}
		</div>
	);
};

registerRenderer("api-trigger", ApiTriggerRenderer);
export default ApiTriggerRenderer;
