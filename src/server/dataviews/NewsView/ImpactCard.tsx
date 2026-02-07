import { Activity, ChevronRight, TrendingUp } from "lucide-react";
import { formatTimeAgo, getImpactColor, type NewsImpact } from "./types";

interface ImpactCardProps {
  impact: NewsImpact;
  onClick?: () => void;
}

export function ImpactCard({ impact, onClick }: ImpactCardProps) {
  const impactColor = getImpactColor(impact.impact_score);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-dark-400/30 rounded-lg p-3 hover:bg-dark-400/50 transition-colors cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-white text-sm font-medium line-clamp-1 group-hover:text-green-400 transition-colors">
            {impact.title}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs bg-dark-600 text-gray-300 px-1.5 py-0.5 rounded font-mono">
              {impact.ticker}
            </span>
            <span className="text-[10px] text-gray-600">
              {formatTimeAgo(impact.timestamp)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className={`text-lg font-bold ${impactColor}`}>
            {(impact.impact_score * 100).toFixed(0)}%
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-green-400 transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="bg-dark-500 rounded p-2">
          <div className="text-gray-600 mb-0.5 flex items-center gap-1">
            <Activity size={8} />
            Relevance
          </div>
          <div className="text-white font-medium">
            {(impact.relevance * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-dark-500 rounded p-2">
          <div className="text-gray-600 mb-0.5 flex items-center gap-1">
            <TrendingUp size={8} />
            Volume 24h
          </div>
          <div className="text-white font-medium">
            $
            {impact.volume_24hr >= 1000000
              ? `${(impact.volume_24hr / 1000000).toFixed(1)}M`
              : `${(impact.volume_24hr / 1000).toFixed(0)}K`}
          </div>
        </div>
        <div className="bg-dark-500 rounded p-2">
          <div className="text-gray-600 mb-0.5">Probability</div>
          <div className="text-white font-medium">
            {(impact.prob * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </button>
  );
}
