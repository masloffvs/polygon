import { NumericFont } from "@/ui/components";

export const SignalDetailRow = ({
	label,
	fullName,
	value,
	age,
	maxAge,
	weight,
	phaseMultiplier,
}: {
	label: string;
	fullName: string;
	value: number | null;
	age: number | null;
	maxAge: number;
	weight: number;
	phaseMultiplier: number;
}) => {
	const isFresh = age !== null && age < maxAge;
	const freshness = age !== null ? Math.max(0, 1 - age / maxAge) : 0;
	const contribution =
		value !== null ? Math.abs(value) * weight * phaseMultiplier : 0;

	return (
		<div className="flex items-center gap-3 py-2 border-b border-dark-700 hover:bg-dark-400/20 transition-colors px-2 rounded">
			<div className="w-12 text-center">
				<span className="text-sm font-bold text-gray-400">{label}</span>
			</div>
			<div className="flex-1">
				<div className="text-xs text-gray-400">{fullName}</div>
				{value !== null ? (
					<div className="flex items-center gap-2">
						<NumericFont
							className={`text-sm font-bold ${value > 0 ? "text-green-400" : value < 0 ? "text-red-400" : "text-gray-500"}`}
						>
							{value > 0 ? "+" : ""}
							{(value * 100).toFixed(1)}%
						</NumericFont>
						<NumericFont
							className={`text-[10px] ${isFresh ? "text-gray-500" : "text-red-400"}`}
						>
							{age?.toFixed(0)}s ago
						</NumericFont>
					</div>
				) : (
					<span className="text-xs text-gray-600">No data</span>
				)}
			</div>
			<div className="text-right">
				<div className="text-[10px] text-gray-500">Weight</div>
				<NumericFont className="text-xs text-gray-400">
					{(weight * 100).toFixed(0)}% × {phaseMultiplier.toFixed(1)}
				</NumericFont>
			</div>
			<div className="w-16 text-right hidden lg:block">
				<div className="text-[10px] text-gray-500">Fresh</div>
				<NumericFont
					className={`text-xs ${freshness > 0.5 ? "text-green-400" : freshness > 0.2 ? "text-yellow-400" : "text-red-400"}`}
				>
					{(freshness * 100).toFixed(0)}%
				</NumericFont>
			</div>
			<div className="w-16 text-right">
				<div className="text-[10px] text-gray-500">Contrib</div>
				<NumericFont className="text-xs text-blue-400">
					{(contribution * 100).toFixed(1)}%
				</NumericFont>
			</div>
		</div>
	);
};

export const ConfidenceMeter = ({
	confidence,
	threshold,
}: {
	confidence: number;
	threshold: number;
}) => {
	const isAbove = confidence >= threshold;
	const percentage = Math.min(100, confidence);

	return (
		<div className="relative">
			<div className="w-full h-3 bg-dark-800 overflow-hidden border border-dark-700 rounded-sm">
				<div
					className={`h-full transition-all duration-300 ${isAbove ? "bg-green-400" : "bg-red-400"}`}
					style={{ width: `${percentage}%` }}
				/>
				{/* Threshold marker */}
				<div
					className="absolute top-0 h-full w-0.5 bg-yellow-400"
					style={{ left: `${threshold}%` }}
				/>
			</div>
			<div className="flex justify-between text-[8px] mt-0.5">
				<span className="text-gray-500">0%</span>
				<NumericFont className={isAbove ? "text-green-400" : "text-red-400"}>
					{(confidence ?? 0).toFixed(1)}%
				</NumericFont>
				<span className="text-yellow-400">{threshold}%</span>
			</div>
		</div>
	);
};
