import React from "react";

export interface CWInputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
	/** Input label */
	label?: string;
	/** Error message */
	error?: string;
	/** Helper text */
	helperText?: string;
	/** Left icon/element */
	leftElement?: React.ReactNode;
	/** Right icon/element */
	rightElement?: React.ReactNode;
	/** Input size */
	inputSize?: "sm" | "md" | "lg";
}

export const CWInput = React.forwardRef<HTMLInputElement, CWInputProps>(
	(
		{
			label,
			error,
			helperText,
			leftElement,
			rightElement,
			inputSize = "md",
			className = "",
			...props
		},
		ref,
	) => {
		const sizeStyles = {
			sm: "h-6 text-[10px] px-1.5",
			md: "h-7 text-xs px-2",
			lg: "h-9 text-sm px-3",
		};

		return (
			<div className={`flex flex-col gap-1 ${className}`}>
				{label && (
					<label className="text-[10px] font-medium text-[#888888]">
						{label}
					</label>
				)}

				<div className="relative flex items-center">
					{leftElement && (
						<div className="absolute left-2.5 text-[#5a5a5a]">
							{leftElement}
						</div>
					)}

					<input
						ref={ref}
						className={`
            w-full bg-[#111111] border rounded-sm
            text-[#ececec] placeholder-[#5a5a5a] font-mono
            focus:outline-none focus:ring-1
            transition-all duration-150
            ${sizeStyles[inputSize]}
            ${leftElement ? "pl-8" : ""}
            ${rightElement ? "pr-8" : ""}
            ${
							error
								? "border-[#ff3d3d] focus:border-[#ff3d3d] focus:ring-[#ff3d3d]"
								: "border-[#1e1e1e] focus:border-[#2196f3] focus:ring-[#2196f3]"
						}
          `}
						{...props}
					/>

					{rightElement && (
						<div className="absolute right-2.5 text-[#5a5a5a]">
							{rightElement}
						</div>
					)}
				</div>

				{(error || helperText) && (
					<span
						className={`text-[10px] ${error ? "text-[#ff3d3d]" : "text-[#5a5a5a]"}`}
					>
						{error || helperText}
					</span>
				)}
			</div>
		);
	},
);

CWInput.displayName = "CWInput";

/** Search input with icon */
export interface CWSearchInputProps extends Omit<CWInputProps, "leftElement"> {
	onSearch?: (value: string) => void;
}

export const CWSearchInput = ({ onSearch, ...props }: CWSearchInputProps) => {
	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && onSearch) {
			onSearch((e.target as HTMLInputElement).value);
		}
	};

	return (
		<CWInput
			leftElement={
				<svg
					className="w-4 h-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
					/>
				</svg>
			}
			placeholder="Search..."
			onKeyDown={handleKeyDown}
			{...props}
		/>
	);
};

/** Number input for trading */
export interface CWNumberInputProps extends Omit<CWInputProps, "type"> {
	currency?: string;
	step?: number;
	min?: number;
	max?: number;
}

export const CWNumberInput = ({
	currency,
	step = 0.01,
	min,
	max,
	...props
}: CWNumberInputProps) => {
	return (
		<CWInput
			type="number"
			step={step}
			min={min}
			max={max}
			rightElement={
				currency ? <span className="text-xs">{currency}</span> : undefined
			}
			{...props}
		/>
	);
};
