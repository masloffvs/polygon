import { eq, get, gt, isNull, lt, map } from "lodash-es";

export interface CorrelationData {
  /** Asset symbols */
  assets: string[];
  /** Correlation values matrix [row][col] */
  values: (number | null)[][];
}

export interface CWCorrelationMatrixProps {
  /** Correlation data */
  data: CorrelationData;
  /** Cell size in pixels */
  cellSize?: number;
  /** Show values in cells */
  showValues?: boolean;
  /** Decimal places for values */
  precision?: number;
  /** Cell click handler */
  onCellClick?: (row: string, col: string, value: number | null) => void;
  className?: string;
}

export const CWCorrelationMatrix = ({
  data,
  cellSize = 48,
  showValues = true,
  precision = 2,
  onCellClick,
  className = "",
}: CWCorrelationMatrixProps) => {
  const { assets, values } = data;

  const getColor = (value: number | null): string => {
    if (isNull(value)) return "transparent";

    // Correlation ranges from -1 to 1
    // Positive = green, Negative = red
    const absValue = Math.abs(value);
    const alpha = absValue * 0.8 + 0.1;

    if (gt(value, 0)) {
      return `rgba(0, 200, 83, ${alpha})`;
    } else if (lt(value, 0)) {
      return `rgba(255, 61, 61, ${alpha})`;
    }
    return "rgba(30, 30, 30, 0.5)";
  };

  const getTextColor = (value: number | null): string => {
    if (isNull(value)) return "#444444";
    const absValue = Math.abs(value);
    return gt(absValue, 0.4) ? "#ffffff" : "#a0a0a0";
  };

  return (
    <div className={`inline-block ${className}`}>
      <div className="flex">
        {/* Empty corner cell */}
        <div style={{ width: cellSize, height: cellSize }} />

        {/* Column headers */}
        {map(assets, (asset) => (
          <div
            key={`header-${asset}`}
            style={{ width: cellSize, height: cellSize }}
            className="flex items-center justify-center p-1"
          >
            <span className="text-[10px] uppercase font-mono text-[#666666] font-medium transform -rotate-45 origin-center whitespace-nowrap overflow-hidden">
              {asset}
            </span>
          </div>
        ))}
      </div>

      {map(assets, (rowAsset, rowIndex) => (
        <div key={rowAsset} className="flex">
          {/* Row header */}
          <div
            style={{ width: cellSize, height: cellSize }}
            className="flex items-center justify-end pr-2"
          >
            <span className="text-[10px] uppercase font-mono text-[#666666] font-medium">
              {rowAsset}
            </span>
          </div>

          {/* Cells */}
          {map(assets, (colAsset, colIndex) => {
            const value = get(values, [rowIndex, colIndex], null);
            const isDiagonal = eq(rowIndex, colIndex);

            return (
              <div
                key={`${rowAsset}-${colAsset}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: isDiagonal ? "#111111" : getColor(value),
                }}
                className={`
                  flex items-center justify-center border border-[#0d0d0e]
                  ${!isDiagonal && onCellClick ? "cursor-pointer hover:opacity-90 hover:border-[#333333]" : ""}
                  transition-all duration-75
                `}
                onClick={() =>
                  !isDiagonal && onCellClick?.(rowAsset, colAsset, value)
                }
              >
                {showValues && !isDiagonal && !isNull(value) && (
                  <span
                    className="text-[10px] font-mono leading-none"
                    style={{ color: getTextColor(value) }}
                  >
                    {value.toFixed(precision)}
                  </span>
                )}
                {isDiagonal && (
                  <div className="w-2 h-2 rounded-full bg-[#333333] opacity-50" />
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="mt-2 flex items-center gap-4 text-[10px] font-mono text-[#666666]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[rgba(0,200,83,0.7)]" />
          <span>POS CORRELATION</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[rgba(255,61,61,0.7)]" />
          <span>NEG CORRELATION</span>
        </div>
      </div>
    </div>
  );
};
