import classNames from "classnames";
import type { ReactNode } from "react";

export interface StatCardProps {
  title: string;
  value: string | number;
  status?:
    | "active"
    | "waiting"
    | "neutral"
    | "success"
    | "warning"
    | "error"
    | "info";
  statusText?: string;
  subtext?: string;
  icon?: ReactNode;
  className?: string;
}

const statusMap: Record<string, string> = {
  active: "text-green-400",
  waiting: "text-yellow-400",
  neutral: "text-blue-400",
  success: "text-green-400",
  warning: "text-yellow-400",
  error: "text-red-400",
  info: "text-blue-400",
};

const dotMap: Record<string, string> = {
  active: "bg-green-400",
  waiting: "bg-yellow-400",
  neutral: "bg-blue-400",
  success: "bg-green-400",
  warning: "bg-yellow-400",
  error: "bg-red-400",
  info: "bg-blue-400",
};

const Card = ({
  variant,
  className,
  children,
}: {
  variant: "subtle" | "default";
  className?: string;
  children: ReactNode;
}) => {
  const baseClasses =
    "p-4 rounded-lg shadow-sm border border-dark-700 flex flex-col";
  const variantClasses = variant === "subtle" ? "bg-dark-600" : "bg-dark-700";

  return (
    <div className={classNames(baseClasses, variantClasses, className)}>
      {children}
    </div>
  );
};

export const StatCard = ({
  title,
  value,
  status = "neutral",
  statusText,
  subtext,
  icon,
  className,
}: StatCardProps) => {
  return (
    <Card
      variant="subtle"
      className={classNames("flex flex-col gap-2", className)}
    >
      <div className="flex items-center justify-between text-gray-400">
        <span className="text-[10px] font-bold tracking-wider uppercase">
          {title}
        </span>
        {icon && <span className="opacity-50">{icon}</span>}
      </div>

      <div className="text-2xl font-light text-white tracking-wide">
        {value}
      </div>

      <div className="flex items-center justify-between mt-auto pt-2">
        <div className="flex items-center gap-2">
          <span
            className={classNames(
              "w-1.5 h-1.5 rounded-full",
              dotMap[status] || dotMap.neutral,
            )}
          />
          <span
            className={classNames(
              "text-xs font-medium",
              statusMap[status] || statusMap.neutral,
            )}
          >
            {statusText}
          </span>
        </div>
        {subtext && (
          <span className="text-[10px] text-gray-500">{subtext}</span>
        )}
      </div>
    </Card>
  );
};
