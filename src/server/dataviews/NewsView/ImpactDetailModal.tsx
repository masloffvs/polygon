import {
  Activity,
  ExternalLink,
  Loader2,
  Newspaper,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  formatTimeAgo,
  getImpactColor,
  type NewsArticle,
  type NewsImpact,
} from "./types";

interface ImpactDetails {
  marketId: string;
  history: NewsImpact[];
  relatedNews: Array<{
    score: number;
    summary: string;
    highlights: string[];
    date: string;
  }>;
  mentionedNews: NewsArticle[];
}

interface ImpactDetailModalProps {
  impact: NewsImpact;
  onClose: () => void;
}

export function ImpactDetailModal({ impact, onClose }: ImpactDetailModalProps) {
  const [details, setDetails] = useState<ImpactDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "related" | "mentioned" | "history"
  >("related");

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        marketId: impact.market_id,
        title: impact.title,
      });
      const res = await fetch(`/api/news-impact/details?${params}`);
      const data = await res.json();
      setDetails(data);
    } catch (err) {
      console.error("Failed to fetch impact details:", err);
    } finally {
      setLoading(false);
    }
  }, [impact.market_id, impact.title]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const impactColor = getImpactColor(impact.impact_score);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        className="bg-dark-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={() => {}}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-dark-500">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-white text-lg font-semibold line-clamp-2">
              {impact.title}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs bg-dark-500 text-gray-300 px-2 py-0.5 rounded font-mono">
                {impact.ticker}
              </span>
              <span className="text-xs text-gray-500">
                {formatTimeAgo(impact.timestamp)}
              </span>
              <span className={`text-sm font-bold ${impactColor}`}>
                {(impact.impact_score * 100).toFixed(0)}% impact
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-500 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-dark-600/50">
          <div className="text-center">
            <div className="text-gray-500 text-[10px] mb-0.5 flex items-center justify-center gap-1">
              <Activity size={10} />
              Relevance
            </div>
            <div className="text-white font-bold">
              {(impact.relevance * 100).toFixed(0)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 text-[10px] mb-0.5 flex items-center justify-center gap-1">
              <TrendingUp size={10} />
              Volume 24h
            </div>
            <div className="text-white font-bold">
              $
              {impact.volume_24hr >= 1000000
                ? `${(impact.volume_24hr / 1000000).toFixed(1)}M`
                : `${(impact.volume_24hr / 1000).toFixed(0)}K`}
            </div>
          </div>
          <div className="text-center">
            <div className="text-gray-500 text-[10px] mb-0.5">Probability</div>
            <div className="text-white font-bold">
              {(impact.prob * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab("related")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "related"
                ? "bg-green-500/20 text-green-400"
                : "bg-dark-600 text-gray-400 hover:bg-dark-500"
            }`}
          >
            <Sparkles size={12} />
            AI Related News
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("mentioned")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "mentioned"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-dark-600 text-gray-400 hover:bg-dark-500"
            }`}
          >
            <Newspaper size={12} />
            Mentioned In
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "history"
                ? "bg-purple-500/20 text-purple-400"
                : "bg-dark-600 text-gray-400 hover:bg-dark-500"
            }`}
          >
            <TrendingUp size={12} />
            History
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-280px)]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
            </div>
          ) : activeTab === "related" ? (
            <div className="space-y-3">
              {details?.relatedNews && details.relatedNews.length > 0 ? (
                details.relatedNews.map((news, idx) => (
                  <div key={idx} className="bg-dark-500/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-green-400 text-xs font-medium">
                        {(news.score * 100).toFixed(0)}% match
                      </span>
                      <span className="text-gray-600 text-[10px]">
                        {news.date
                          ? new Date(news.date).toLocaleDateString()
                          : ""}
                      </span>
                    </div>
                    <p className="text-white text-sm mb-2">{news.summary}</p>
                    {news.highlights && news.highlights.length > 0 && (
                      <ul className="space-y-1">
                        {news.highlights.slice(0, 3).map((h, i) => (
                          <li
                            key={i}
                            className="text-gray-400 text-xs flex items-start gap-1.5"
                          >
                            <span className="text-green-500 mt-0.5">•</span>
                            {h}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Sparkles className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">
                    No AI-matched news found
                  </p>
                  <p className="text-gray-600 text-xs mt-1">
                    Vector search returned no similar briefings
                  </p>
                </div>
              )}
            </div>
          ) : activeTab === "mentioned" ? (
            <div className="space-y-2">
              {details?.mentionedNews && details.mentionedNews.length > 0 ? (
                details.mentionedNews.map((article) => (
                  <a
                    key={article.uuid}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-dark-500/50 rounded-lg p-3 hover:bg-dark-500 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-white text-sm line-clamp-2 flex-1">
                        {article.content}
                      </p>
                      <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-green-400 shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-500">
                        {article.source}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        {formatTimeAgo(article.published_at)}
                      </span>
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center py-8">
                  <Newspaper className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">
                    No news mentions found
                  </p>
                  <p className="text-gray-600 text-xs mt-1">
                    No articles mention "{impact.ticker}"
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {details?.history && details.history.length > 0 ? (
                details.history.map((h, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-dark-500/50 rounded-lg p-3"
                  >
                    <span className="text-gray-400 text-xs">
                      {new Date(h.timestamp).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-xs">
                        Vol: ${(h.volume_24hr / 1000).toFixed(0)}K
                      </span>
                      <span
                        className={`font-medium text-sm ${getImpactColor(h.impact_score)}`}
                      >
                        {(h.impact_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No history available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
