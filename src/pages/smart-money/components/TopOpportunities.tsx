import { NumericFont } from "@/ui/components";
import type { SymbolState } from "../types";

const TopOpportunities = ({
	symbols,
	onSelect,
	variant = "card",
}: {
	symbols: SymbolState[];
	onSelect: (s: SymbolState) => void;
	variant?: "card" | "flat";
}) => {
	const containerClasses =
		variant === "card"
			? "flex flex-col min-h-0 h-[360px] bg-dark-400/30 border border-dark-700 rounded-xl overflow-hidden relative group hover:border-dark-600 transition-colors"
			: "flex flex-col min-h-0 h-full overflow-hidden relative";

	return (
		<div className={containerClasses}>
			{variant === "card" && (
				<>
					{/* Decorators */}
					<div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-dark-600" />
					<div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-dark-600" />
					<div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-dark-600" />
					<div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-dark-600" />
				</>
			)}

			<div className="p-3 border-b border-dark-700 bg-dark-400/50 flex justify-between items-center">
				<span className="text-xs font-mono font-bold text-gray-400 uppercase">
					Top Opportunities
				</span>
				<span className="text-[10px] text-gray-500 font-mono">
					By Confidence
				</span>
			</div>

			<div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
				{symbols
					.sort((a, b) => b.confidence - a.confidence)
					.map((sym) => (
						<div
							key={sym.symbol}
							onClick={() => onSelect(sym)}
							className="p-2 mb-1 border border-transparent hover:border-dark-600 hover:bg-dark-400/50 cursor-pointer rounded transition-all group"
						>
							<div className="flex justify-between items-center mb-1">
								<span className="text-sm font-bold text-gray-100 font-mono">
									{sym.symbol}
								</span>
								<span
									className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sym.potentialDirection === "UP" ? "bg-green-500/10 text-green-400" : sym.potentialDirection === "DOWN" ? "bg-red-500/10 text-red-500" : "text-gray-500"}`}
								>
									{sym.potentialDirection}
								</span>
							</div>
							<div className="flex justify-between items-center text-[10px] font-mono text-gray-500">
								<span>
									Conf:{" "}
									<NumericFont className="text-gray-200">
										{(sym.confidence ?? 0).toFixed(1)}%
									</NumericFont>
								</span>
								<span>
									Score:{" "}
									<NumericFont
										className={
											(sym.score || 0) > 0.5 ? "text-blue-400" : "text-gray-500"
										}
									>
										{(sym.score ?? 0).toFixed(2)}
									</NumericFont>
								</span>
							</div>
							{/* Mini Confidence Bar */}
							<div className="mt-1 h-0.5 w-full bg-dark-700 rounded-full overflow-hidden">
								<div
									className={`h-full ${sym.potentialDirection === "UP" ? "bg-green-400" : "bg-red-400"}`}
									style={{ width: `${sym.confidence}%` }}
								/>
							</div>
						</div>
					))}
			</div>
		</div>
	);
};

export default TopOpportunities;
