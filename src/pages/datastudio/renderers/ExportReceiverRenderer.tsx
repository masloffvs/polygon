import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

export const ExportReceiverRenderer: React.FC<NodeRendererProps> = ({
	data,
}) => {
	// 'data' comes from latestResult passed by MemoizedRenderer
	// Check 'data' port first (as per schema), fallback to 'output' or just the raw result
	const packets = data || {};
	const packet = packets.data || packets.output;
	const result = packet?.value ?? data; // Fallback to raw data if no ports structure

	if (!result) {
		return (
			<div className="p-3 text-xs text-gray-400 italic">
				Waiting for data...
			</div>
		);
	}

	// Check if it's the Global Price Event structure
	if (result.symbol && result.midPrice) {
		return (
			<div className="p-3 bg-dark-800/50 rounded-lg min-w-[200px]">
				<div className="flex justify-between items-center mb-2">
					<span className="font-bold text-lime-400">{result.symbol}</span>
					<span className="text-sm font-mono text-white">
						${result.midPrice.toFixed(2)}
					</span>
				</div>
				<div className="grid grid-cols-2 gap-2 text-[10px] text-gray-400">
					<div>Spread: {result.spread.toFixed(2)}</div>
					<div>Sources: {result.sources}</div>
				</div>
				<div className="mt-2 flex gap-1 flex-wrap">
					{result.components?.map((c: any) => (
						<span
							key={c.source}
							className="px-1.5 py-0.5 bg-dark-700 rounded text-[9px] text-gray-300"
						>
							{c.source.replace("-source", "")}
						</span>
					))}
				</div>
			</div>
		);
	}

	// Fallback generic JSON view
	return (
		<div className="p-3 bg-dark-800/50 rounded-lg max-h-40 overflow-y-auto min-w-[200px]">
			<pre className="text-[10px] text-gray-300 font-mono whitespace-pre-wrap">
				{JSON.stringify(result, null, 2)}
			</pre>
		</div>
	);
};

registerRenderer("export-receiver", ExportReceiverRenderer);
