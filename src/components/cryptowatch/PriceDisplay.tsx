import NumberFlow from "@number-flow/react";
import { CWBadge } from "./Badge";

export interface CWPriceDisplayProps {
	/** Current price */
	price: number;
	/** Price change percentage */
	change?: number;
	/** Currency symbol */
	currency?: string;
	/** Size variant */
	size?: "sm" | "md" | "lg" | "xl";
	/** Show currency symbol */
	showCurrency?: boolean;
	className?: string;
}

export const CWPriceDisplay = ({
	price,
	change,
	currency = "USDT",
	size = "md",
	showCurrency = true,
	className = "",
}: CWPriceDisplayProps) => {
	const _formatPrice = (p: number): string => {
		if (p >= 1000)
			return p.toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			});
		if (p >= 1) return p.toFixed(2);
		if (p >= 0.0001) return p.toFixed(6);
		return p.toFixed(8);
	};

	const sizeStyles = {
		sm: "text-lg",
		md: "text-xl",
		lg: "text-2xl",
		xl: "text-3xl",
	};

	const isPositive = change !== undefined && change > 0;
	const priceColor =
		change === undefined
			? "text-white/90"
			: isPositive
				? "text-[#00c853]"
				: "text-[#ff3d3d]";

	return (
		<div className={`flex items-baseline gap-2 ${className}`}>
			<span
				className={`font-mono font-semibold ${sizeStyles[size]} ${priceColor}`}
			>
				<NumberFlow
					value={price}
					format={{
						minimumFractionDigits: price >= 1000 ? 2 : price >= 1 ? 2 : 6,
						maximumFractionDigits: price >= 1000 ? 2 : price >= 1 ? 2 : 8,
					}}
				/>
			</span>
			{showCurrency && (
				<span className="text-sm text-white/40">{currency}</span>
			)}
			{change !== undefined && (
				<CWBadge
					value={change}
					isPercentage
					size={size === "xl" ? "lg" : size === "lg" ? "md" : "sm"}
				/>
			)}
		</div>
	);
};

/** Compact price card */
export interface CWPriceCardProps {
	symbol: string;
	name?: string;
	price: number;
	change: number;
	high24h?: number;
	low24h?: number;
	volume24h?: number;
	currency?: string;
	onClick?: () => void;
	className?: string;
}

export const CWPriceCard = ({
	symbol,
	name,
	price,
	change,
	high24h,
	low24h,
	volume24h,
	currency = "$",
	onClick,
	className = "",
}: CWPriceCardProps) => {
	const formatPrice = (p: number): string => {
		if (p >= 1000)
			return `${currency}${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
		if (p >= 1) return `${currency}${p.toFixed(2)}`;
		return `${currency}${p.toFixed(6)}`;
	};

	const formatVolume = (v: number): string => {
		if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
		if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
		if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
		return v.toFixed(2);
	};

	return (
		<div
			onClick={onClick}
			className={`
        bg-[#131315] border border-[#2a2a2d] rounded-sm p-4
        ${onClick ? "cursor-pointer hover:bg-[#1a1a1d] hover:border-[#3a3a3d]" : ""}
        transition-all duration-150
        ${className}
      `}
		>
			<div className="flex items-start justify-between mb-3">
				<div>
					<div className="flex items-center gap-2">
						<span className="text-lg font-semibold text-[#e8e8e8]">
							{symbol}
						</span>
						<CWBadge value={change} isPercentage size="sm" />
					</div>
					{name && <span className="text-xs text-[#5a5a5a]">{name}</span>}
				</div>
			</div>

			<div className="mb-3">
				<span
					className={`text-2xl font-mono font-semibold ${change >= 0 ? "text-[#00c853]" : "text-[#ff3d3d]"}`}
				>
					{formatPrice(price)}
				</span>
			</div>

			{(high24h !== undefined ||
				low24h !== undefined ||
				volume24h !== undefined) && (
				<div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#2a2a2d]">
					{high24h !== undefined && (
						<div>
							<div className="text-[10px] text-[#5a5a5a] uppercase mb-0.5">
								24h High
							</div>
							<div className="text-xs font-mono text-[#00c853]">
								{formatPrice(high24h)}
							</div>
						</div>
					)}
					{low24h !== undefined && (
						<div>
							<div className="text-[10px] text-[#5a5a5a] uppercase mb-0.5">
								24h Low
							</div>
							<div className="text-xs font-mono text-[#ff3d3d]">
								{formatPrice(low24h)}
							</div>
						</div>
					)}
					{volume24h !== undefined && (
						<div>
							<div className="text-[10px] text-[#5a5a5a] uppercase mb-0.5">
								Volume
							</div>
							<div className="text-xs font-mono text-[#8a8a8a]">
								{currency}
								{formatVolume(volume24h)}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
