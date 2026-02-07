import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const Any2TextRenderer: React.FC<NodeRendererProps> = ({ data, nodeData }) => {
	const result = data?.text?.value;
	const settings = nodeData?.settings || {};

	const style = settings.style || "brief";
	const language = settings.language || "en";
	const maxLength = settings.maxLength || 500;

	const styleLabels: Record<string, string> = {
		brief: "Brief",
		detailed: "Detailed",
		bullets: "Bullets",
		telegram: "Telegram",
		custom: "Custom",
	};

	const langLabels: Record<string, string> = {
		en: "EN",
		ru: "RU",
		auto: "Auto",
	};

	return (
		<div className="flex flex-col gap-2 p-2 w-full min-w-[220px]">
			{/* Config Tags */}
			<div className="flex flex-wrap gap-1.5">
				<span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">
					{styleLabels[style] || style}
				</span>
				<span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">
					{langLabels[language] || language}
				</span>
				<span className="text-[9px] px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded">
					≤{maxLength}
				</span>
			</div>

			{/* Result Display */}
			{result?.text ? (
				<div className="bg-dark-900/50 rounded p-2">
					<div className="text-[10px] text-gray-300 leading-relaxed line-clamp-4 whitespace-pre-wrap">
						{result.text}
					</div>
					{result.text.length > 150 && (
						<div className="text-[9px] text-gray-600 mt-1">
							{result.text.length} chars
						</div>
					)}
				</div>
			) : result?.error ? (
				<div className="bg-red-900/20 rounded p-2">
					<div className="text-[10px] text-red-400">{result.error}</div>
				</div>
			) : (
				<div className="text-[10px] text-gray-600 italic text-center py-2">
					Waiting for input...
				</div>
			)}

			{/* Input Preview */}
			{result?.inputPreview && (
				<div className="text-[9px] text-gray-600 truncate">
					← {result.inputPreview}...
				</div>
			)}
		</div>
	);
};

registerRenderer("any2text", Any2TextRenderer);
export default Any2TextRenderer;
