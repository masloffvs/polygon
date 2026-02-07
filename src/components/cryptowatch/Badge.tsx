import { gt, isNumber, isString, lt, toNumber } from "lodash-es";

export interface CWBadgeProps {
  /** The value to display */
  value: number | string;
  /** Badge variant */
  variant?: "default" | "positive" | "negative" | "neutral";
  /** Show as percentage */
  isPercentage?: boolean;
  /** Show + prefix for positive values */
  showSign?: boolean;
  /** Size of the badge */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const CWBadge = ({
  value,
  variant = "default",
  isPercentage = false,
  showSign = true,
  size = "md",
  className = "",
}: CWBadgeProps) => {
  const numValue = isString(value) ? toNumber(value) : value;
  const isPositive = gt(numValue, 0);
  const isNegative = lt(numValue, 0);

  // Auto-determine variant if not explicitly set to 'default' or 'neutral'
  const computedVariant =
    variant === "default"
      ? isPositive
        ? "positive"
        : isNegative
          ? "negative"
          : "neutral"
      : variant;

  const sizeStyles = {
    sm: "px-1 py-0 text-[9px]",
    md: "px-1.5 py-px text-[10px]",
    lg: "px-2 py-0.5 text-xs",
  };

  const variantStyles = {
    default: "bg-[#111111] text-[#ececec]",
    positive: "bg-[rgba(0,200,83,0.1)] text-[#00c853]",
    negative: "bg-[rgba(255,61,61,0.1)] text-[#ff3d3d]",
    neutral: "bg-[#111111] text-[#666666]",
  };

  const formatValue = () => {
    const absValue = Math.abs(numValue);
    const formatted = isPercentage
      ? `${absValue.toFixed(2)}%`
      : absValue.toString();

    if (showSign && isPositive) return `+${formatted}`;
    if (isNegative) return `-${formatted}`;
    return formatted;
  };

  return (
    <span
      className={`inline-flex items-center font-mono rounded-sm ${sizeStyles[size]} ${variantStyles[computedVariant]} ${className}`}
    >
      {formatValue()}
    </span>
  );
};

/** Volume badge with formatted numbers */
export interface CWVolumeBadgeProps {
  value: number;
  currency?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const CWVolumeBadge = ({
  value,
  currency = "$",
  size = "md",
  className = "",
}: CWVolumeBadgeProps) => {
  const formatVolume = (num: number | null | undefined): string => {
    if (!isNumber(num) || Number.isNaN(num)) return "0.00";
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const sizeStyles = {
    sm: "text-[10px]",
    md: "text-xs",
    lg: "text-sm",
  };

  return (
    <span
      className={`font-mono text-[#8a8a8a] ${sizeStyles[size]} ${className}`}
    >
      {currency}
      {formatVolume(value)}
    </span>
  );
};
