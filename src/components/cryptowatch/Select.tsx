import { eq, get, map } from "lodash-es";
import React from "react";

export interface CWSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface CWSelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  /** Select options */
  options: CWSelectOption[];
  /** Label */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Size variant */
  selectSize?: "sm" | "md" | "lg";
  /** Error message */
  error?: string;
}

export const CWSelect = React.forwardRef<HTMLSelectElement, CWSelectProps>(
  (
    {
      options,
      label,
      placeholder,
      selectSize = "md",
      error,
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

        <div className="relative">
          <select
            ref={ref}
            className={`
            w-full appearance-none bg-[#111111] border rounded-sm
            text-[#ececec] cursor-pointer font-mono
            focus:outline-none focus:ring-1
            transition-all duration-150
            pr-8
            ${sizeStyles[selectSize]}
            ${
              error
                ? "border-[#ff3d3d] focus:border-[#ff3d3d] focus:ring-[#ff3d3d]"
                : "border-[#1e1e1e] focus:border-[#2196f3] focus:ring-[#2196f3]"
            }
          `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {map(options, (option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Dropdown arrow */}
          <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
            <svg
              className="w-4 h-4 text-[#5a5a5a]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {error && <span className="text-[10px] text-[#ff3d3d]">{error}</span>}
      </div>
    );
  },
);

CWSelect.displayName = "CWSelect";

/** Pill-style tabs/select */
export interface CWTabsProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
  className?: string;
}

export const CWTabs = ({
  options,
  value,
  onChange,
  size = "md",
  className = "",
}: CWTabsProps) => {
  const sizeStyles: Record<"sm" | "md", string> = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  };

  const currentSizeStyle = get(sizeStyles, size, sizeStyles.md);

  return (
    <div className={`inline-flex bg-[#1a1a1d] rounded-sm p-0.5 ${className}`}>
      {map(options, (option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`
                        ${currentSizeStyle}
                        rounded-sm font-medium transition-all duration-150
                        ${
                          eq(value, option.value)
                            ? "bg-[#2a2a2d] text-[#e8e8e8]"
                            : "text-[#8a8a8a] hover:text-[#e8e8e8]"
                        }
                    `}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
