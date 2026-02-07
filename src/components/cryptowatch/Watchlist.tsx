import { gte, isUndefined, map } from "lodash-es";
import { CWBadge } from "./Badge";

export interface WatchlistAsset {
  symbol: string;
  name: string;
  exchange?: string;
  price: number;
  change: number;
  volume?: number;
  currency?: string;
}

export interface CWWatchlistItemProps {
  asset: WatchlistAsset;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const CWWatchlistItem = ({
  asset,
  selected = false,
  onClick,
  className = "",
}: CWWatchlistItemProps) => {
  const formatPrice = (price: number): string => {
    if (gte(price, 1000))
      return price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    if (gte(price, 1)) return price.toFixed(2);
    return price.toFixed(6);
  };

  const formatVolume = (vol: number): string => {
    if (gte(vol, 1e9)) return `${(vol / 1e9).toFixed(1)}B`;
    if (gte(vol, 1e6)) return `${(vol / 1e6).toFixed(1)}M`;
    if (gte(vol, 1e3)) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toFixed(0);
  };

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center justify-between px-2.5 py-1.5
        border-b border-[#111111]
        ${selected ? "bg-[#111111]" : "hover:bg-[#0a0a0a]"}
        ${onClick ? "cursor-pointer" : ""}
        transition-colors duration-100
        ${className}
      `}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#ececec]">
            {asset.symbol}
          </span>
          {asset.exchange && (
            <span className="text-[10px] text-[#555555] uppercase">
              {asset.exchange}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[#888888]">{asset.name}</span>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xs font-mono text-[#ececec]">
          {asset.currency || "$"}
          {formatPrice(asset.price)}
        </span>
        <div className="flex items-center gap-2">
          <CWBadge value={asset.change} isPercentage size="sm" />
          {!isUndefined(asset.volume) && (
            <span className="text-[10px] font-mono text-[#555555]">
              {formatVolume(asset.volume)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export interface CWWatchlistProps {
  title?: string;
  assets: WatchlistAsset[];
  selectedSymbol?: string;
  onAssetClick?: (asset: WatchlistAsset) => void;
  className?: string;
}

export const CWWatchlist = ({
  title = "Watchlist",
  assets,
  selectedSymbol,
  onAssetClick,
  className = "",
}: CWWatchlistProps) => {
  return (
    <div
      className={`bg-[#0a0a0a] border border-[#1e1e1e] rounded-sm ${className}`}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#1e1e1e]">
        <span className="text-xs font-medium text-[#ececec] uppercase tracking-wide">
          {title}
        </span>
        <span className="text-[10px] text-[#555555] font-mono">
          {assets.length}
        </span>
      </div>

      <div className="max-h-80 overflow-y-auto cw-scrollbar">
        {map(assets, (asset) => (
          <CWWatchlistItem
            key={`${asset.symbol}-${asset.exchange}`}
            asset={asset}
            selected={asset.symbol === selectedSymbol}
            onClick={() => onAssetClick?.(asset)}
          />
        ))}
      </div>
    </div>
  );
};
