import { type NodeRendererProps, registerRenderer } from "./registry";

const DebugLogRenderer: React.FC<NodeRendererProps> = ({ data }) => {
	const lastMsg =
		data?.output?.value || JSON.stringify(data?.output) || "Waiting...";
	const timestamp = (() => {
		try {
			if (!data?.timestamp || typeof data.timestamp !== "number") return "";
			return new Date(data.timestamp).toLocaleTimeString();
		} catch {
			return "";
		}
	})();

	return (
		<div className="p-2.5 bg-dark-900/50 rounded-lg font-mono text-[10px] text-lime-400/90 overflow-hidden">
			<div className="flex justify-between items-center text-gray-500 mb-2 text-[9px]">
				<span>output</span>
				<span>{timestamp}</span>
			</div>
			<div className="break-all whitespace-pre-wrap max-h-24 overflow-y-auto custom-scrollbar leading-relaxed">
				{typeof lastMsg === "object"
					? JSON.stringify(lastMsg, null, 2)
					: lastMsg}
			</div>
		</div>
	);
};

registerRenderer("debug-log", DebugLogRenderer);
export default DebugLogRenderer;
