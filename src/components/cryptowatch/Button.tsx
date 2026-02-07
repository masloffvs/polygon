import { get } from "lodash-es";
import {
  type ButtonHTMLAttributes,
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

export interface CWButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: "primary" | "secondary" | "success" | "danger" | "ghost";
  /** Button size */
  size?: "sm" | "md" | "lg";
  /** Is button in active/selected state */
  active?: boolean;
  /** Button contents */
  children: ReactNode;
}

export const CWButton = ({
  variant = "secondary",
  size = "md",
  active = false,
  children,
  className = "",
  ...props
}: CWButtonProps) => {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-sm border focus:outline-none focus:ring-1 focus:ring-[#2196f3]";

  const sizeStyles = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };

  const variantStyles = {
    primary:
      "bg-[#2196f3] border-[#2196f3] text-white hover:bg-[#1976d2] hover:border-[#1976d2]",
    secondary: `bg-[#111111] border-[#1e1e1e] text-[#ececec] hover:bg-[#1a1a1a] hover:border-[#3a3a3d] ${active ? "bg-[#1e1e1e] border-[#3a3a3d]" : ""}`,
    success:
      "bg-[#00c853] border-[#00c853] text-white hover:bg-[#00a844] hover:border-[#00a844]",
    danger:
      "bg-[#ff3d3d] border-[#ff3d3d] text-white hover:bg-[#cc3030] hover:border-[#cc3030]",
    ghost:
      "bg-transparent border-transparent text-[#8a8a8a] hover:text-[#ececec] hover:bg-[#111111]",
  };

  return (
    <button
      className={`${baseStyles} ${get(sizeStyles, size)} ${get(variantStyles, variant)} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

/** Button Group for toggle-style buttons */
export interface CWButtonGroupProps {
  children: ReactNode;
  className?: string;
}

export const CWButtonGroup = ({
  children,
  className = "",
}: CWButtonGroupProps) => {
  return (
    <div className={`inline-flex rounded-sm overflow-hidden ${className}`}>
      {Children.map(children, (child, index) => {
        if (isValidElement(child)) {
          return cloneElement(child as ReactElement<CWButtonProps>, {
            className: `${(child.props as CWButtonProps).className || ""} rounded-none ${index > 0 ? "border-l-0" : ""}`,
          });
        }
        return child;
      })}
    </div>
  );
};
