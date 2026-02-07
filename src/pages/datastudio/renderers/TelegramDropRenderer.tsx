import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const TelegramDropRenderer: React.FC<NodeRendererProps> = ({
	data,
	nodeData,
}) => {
	const result = data?.result?.value;
	const settings = nodeData?.settings || {};

	const botToken = settings.botToken || "Not set";
	const chatId = settings.chatId || "Not set";
	const parseMode = settings.parseMode || "HTML";
	const silent = settings.silent || false;

	// Mask token for display (show first 10 chars)
	const maskedToken =
		botToken !== "Not set" ? `${botToken.slice(0, 10)}...` : "Not set";

	return (
		<div className="flex flex-col gap-2 p-2 w-full min-w-[200px]">
			{/* Config Display */}
			<div className="grid grid-cols-2 gap-1 text-[10px]">
				<div className="text-gray-500">Bot:</div>
				<div className="text-cyan-400 font-mono truncate">{maskedToken}</div>
				<div className="text-gray-500">Chat:</div>
				<div className="text-cyan-400 font-mono truncate">{chatId}</div>
				<div className="text-gray-500">Mode:</div>
				<div className="text-gray-300">{parseMode}</div>
				{silent && (
					<>
						<div className="text-gray-500">Silent:</div>
						<div className="text-yellow-400">Yes</div>
					</>
				)}
			</div>

			{/* Last Send Result */}
			{result && (
				<div
					className={`mt-1 p-2 rounded text-xs ${
						result.success ? "bg-green-900/30" : "bg-red-900/30"
					}`}
				>
					{result.success ? (
						<div className="flex items-center gap-2">
							<span className="text-green-400">✓</span>
							<span className="text-gray-300">Sent #{result.messageId}</span>
						</div>
					) : (
						<div className="text-red-400 text-[10px]">
							✗ {result.error || "Send failed"}
						</div>
					)}
				</div>
			)}

			{/* No result yet */}
			{!result && (
				<div className="text-[10px] text-gray-600 italic text-center mt-1">
					Waiting for data...
				</div>
			)}
		</div>
	);
};

registerRenderer("telegram-drop", TelegramDropRenderer);
export default TelegramDropRenderer;
