import { get } from "lodash-es";
import type React from "react";
import { CWVolumeBadge } from "./Badge";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (value: any, row: T, index: number) => React.ReactNode;
}

export interface CWDataTableProps<T> {
  /** Table columns configuration */
  columns: Column<T>[];
  /** Data rows */
  data: T[];
  /** Unique key field */
  keyField?: keyof T;
  /** Enable row hover effect */
  hoverable?: boolean;
  /** Enable striped rows */
  striped?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Custom row class */
  rowClassName?: (row: T, index: number) => string;
  /** Show row numbers */
  showRowNumbers?: boolean;
  className?: string;
}

export function CWDataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  hoverable = true,
  striped = false,
  compact = false,
  onRowClick,
  rowClassName,
  showRowNumbers = false,
  className = "",
}: CWDataTableProps<T>) {
  const cellPadding = compact ? "px-1.5 py-0.5" : "px-2 py-1";
  const fontSize = compact ? "text-[10px]" : "text-xs";
  const tableSpacing = compact ? "border-spacing-y-0.5" : "border-spacing-y-1";

  const getNestedValue = (obj: T, path: string): any => {
    return get(obj, path);
  };

  return (
    <div className={`overflow-auto cw-scrollbar ${className}`}>
      <table className={`w-full border-separate ${tableSpacing}`}>
        <thead>
          <tr>
            {showRowNumbers && (
              <th
                className={`${cellPadding} ${fontSize} text-left text-gray-500 font-semibold w-8 bg-dark-800/60 first:rounded-l-md`}
              >
                #
              </th>
            )}
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`${cellPadding} ${fontSize} text-${col.align || "left"} text-gray-500 font-semibold whitespace-nowrap bg-dark-800/60 uppercase tracking-wider last:rounded-r-md`}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const key = keyField ? String(row[keyField]) : rowIndex;
            const customClass = rowClassName?.(row, rowIndex) || "";
            const rowShade = striped
              ? rowIndex % 2 === 1
                ? "bg-dark-800/20"
                : "bg-dark-900/30"
              : "bg-dark-800/30";
            const hoverShade = hoverable ? "group-hover:bg-dark-700/40" : "";

            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row, rowIndex)}
                className={`
                  ${hoverable ? "cursor-pointer" : ""}
                  ${hoverable ? "group" : ""}
                  ${onRowClick ? "cursor-pointer" : ""}
                  ${customClass}
                  transition-colors duration-150
                `}
              >
                {showRowNumbers && (
                  <td
                    className={`${cellPadding} ${fontSize} text-gray-500 font-mono ${rowShade} ${hoverShade} first:rounded-l-md`}
                  >
                    {rowIndex + 1}
                  </td>
                )}
                {columns.map((col) => {
                  const value = getNestedValue(row, String(col.key));
                  return (
                    <td
                      key={String(col.key)}
                      className={`${cellPadding} ${fontSize} text-${col.align || "left"} text-gray-200 font-sans ${rowShade} ${hoverShade} first:rounded-l-md last:rounded-r-md`}
                    >
                      {col.render ? col.render(value, row, rowIndex) : value}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Pre-configured Exchange Table */
export interface Exchange {
  name: string;
  icon?: string;
  launchYear: number;
  location: string;
  liveMarkets: number;
  liquidity: number;
  volume24h: number;
}

export interface CWExchangeTableProps {
  exchanges: Exchange[];
  onExchangeClick?: (exchange: Exchange) => void;
  className?: string;
}

export const CWExchangeTable = ({
  exchanges,
  onExchangeClick,
  className = "",
}: CWExchangeTableProps) => {
  const columns: Column<Exchange>[] = [
    {
      key: "name",
      header: "Exchange",
      render: (value, row) => (
        <div className="flex items-center gap-2">
          {row.icon && <span className="text-base">{row.icon}</span>}
          <span className="text-[#e8e8e8] font-medium">{value}</span>
        </div>
      ),
    },
    { key: "launchYear", header: "Launch Year", align: "center" },
    { key: "location", header: "HQ Location" },
    {
      key: "liveMarkets",
      header: "Live Markets",
      align: "right",
      render: (value) => (
        <span className="font-mono">{value.toLocaleString()}</span>
      ),
    },
    {
      key: "liquidity",
      header: "Liquidity",
      align: "right",
      render: (value) => (
        <div className="flex items-center gap-2 justify-end">
          <CWVolumeBadge value={value} />
          <div className="w-16 h-1.5 bg-[#1a1a1d] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2196f3] rounded-full"
              style={{ width: `${Math.min((value / 5e8) * 100, 100)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: "volume24h",
      header: "24H Volume",
      align: "right",
      render: (value) => <CWVolumeBadge value={value} />,
    },
  ];

  return (
    <CWDataTable
      columns={columns}
      data={exchanges}
      keyField="name"
      showRowNumbers
      onRowClick={onExchangeClick}
      className={className}
    />
  );
};
