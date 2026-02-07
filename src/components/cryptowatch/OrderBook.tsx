import { defaultTo, gt, isUndefined, map, max, slice } from "lodash-es";

export interface OrderBookEntry {
  price: number;
  amount: number;
  total?: number;
}

export interface CWOrderBookProps {
  /** Ask orders (sell) - sorted by price ascending */
  asks: OrderBookEntry[];
  /** Bid orders (buy) - sorted by price descending */
  bids: OrderBookEntry[];
  /** Current/last price */
  currentPrice?: number;
  /** Price precision */
  pricePrecision?: number;
  /** Amount precision */
  amountPrecision?: number;
  /** Max rows to show per side */
  maxRows?: number;
  /** Show totals column */
  showTotals?: boolean;
  className?: string;
}

export const CWOrderBook = ({
  asks,
  bids,
  currentPrice,
  pricePrecision = 2,
  amountPrecision = 4,
  maxRows = 10,
  showTotals = true,
  className = "",
}: CWOrderBookProps) => {
  const displayAsks = slice(asks, 0, maxRows).reverse();
  const displayBids = slice(bids, 0, maxRows);

  // Calculate max total for bar width
  const maxAskTotal =
    max(map(displayAsks, (a) => defaultTo(a.total, a.amount))) || 0;
  const maxBidTotal =
    max(map(displayBids, (b) => defaultTo(b.total, b.amount))) || 0;
  const maxTotal = max([maxAskTotal, maxBidTotal]) || 1;

  const formatNumber = (num: number, precision: number): string => {
    return num.toFixed(precision);
  };

  const renderRow = (entry: OrderBookEntry, type: "ask" | "bid") => {
    const total = defaultTo(entry.total, entry.amount);
    const barWidth = (total / maxTotal) * 100;
    const isAsk = type === "ask";

    return (
      <div
        key={`${type}-${entry.price}`}
        className="relative flex items-center text-[10px] font-mono h-5 hover:bg-[#111111]"
      >
        {/* Background bar */}
        <div
          className={`absolute inset-y-0 ${isAsk ? "right-0" : "left-0"} ${isAsk ? "bg-[rgba(255,61,61,0.1)]" : "bg-[rgba(0,200,83,0.1)]"}`}
          style={{ width: `${barWidth}%` }}
        />

        {/* Content */}
        <div className="relative flex items-center justify-between w-full px-2">
          <span
            className={`w-20 ${isAsk ? "text-[#ff3d3d]" : "text-[#00c853]"}`}
          >
            {formatNumber(entry.price, pricePrecision)}
          </span>
          <span className="w-20 text-right text-white/90">
            {formatNumber(entry.amount, amountPrecision)}
          </span>
          {showTotals && (
            <span className="w-20 text-right text-white/40">
              {formatNumber(total, amountPrecision)}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`bg-[#0a0a0a] border border-[#1e1e1e] rounded-sm ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#1e1e1e] text-[10px] text-[#555555] uppercase font-medium tracking-wider">
        <span className="w-20">Price</span>
        <span className="w-20 text-right">Amount</span>
        {showTotals && <span className="w-20 text-right">Total</span>}
      </div>

      {/* Asks (Sells) */}
      <div className="py-0.5">
        {displayAsks.map((ask) => renderRow(ask, "ask"))}
      </div>

      {/* Spread / Current Price */}
      {!isUndefined(currentPrice) && (
        <div className="flex items-center justify-center py-1.5 border-y border-[#1e1e1e] bg-[#050505]">
          <span className="text-xs font-mono font-semibold text-[#ececec]">
            {formatNumber(currentPrice, pricePrecision)}
          </span>
          {gt(displayAsks.length, 0) && gt(displayBids.length, 0) && (
            <span className="ml-2 text-[10px] text-[#555555]">
              Spread:{" "}
              {formatNumber(
                displayAsks[displayAsks.length - 1]?.price -
                  displayBids[0]?.price,
                pricePrecision,
              )}
            </span>
          )}
        </div>
      )}

      {/* Bids (Buys) */}
      <div className="py-0.5">
        {displayBids.map((bid) => renderRow(bid, "bid"))}
      </div>
    </div>
  );
};
