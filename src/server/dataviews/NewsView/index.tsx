import { dataviewOf } from "@/server/utils/dataview.helpers";
import {
  Loader2,
  Newspaper,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ImpactCard } from "./ImpactCard";
import { ImpactDetailModal } from "./ImpactDetailModal";
import { NewsCard } from "./NewsCard";
import {
  type NewsArticle,
  type NewsImpact,
  VIEW_TABS,
  type ViewMode,
} from "./types";

interface VectorSearchResult {
  id: string;
  score: number;
  summary: string;
  highlights: string[];
  eventCount: number;
  date: string;
}

export const NewsView = dataviewOf(() => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [impacts, setImpacts] = useState<NewsImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [searchQuery, setSearchQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedImpact, setSelectedImpact] = useState<NewsImpact | null>(null);
  const [vectorResults, setVectorResults] = useState<VectorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const limit = 30;

  const fetchNews = useCallback(
    async (reset = false) => {
      setLoading(true);
      try {
        const currentOffset = reset ? 0 : offset;
        const res = await fetch(
          `/api/news?limit=${limit}&offset=${currentOffset}`,
        );
        const data = await res.json();
        if (reset) {
          setArticles(data || []);
          setOffset(limit);
        } else {
          setArticles((prev) => [...prev, ...(data || [])]);
          setOffset((prev) => prev + limit);
        }
        setHasMore((data || []).length === limit);
      } catch (err) {
        console.error("Failed to fetch news:", err);
      } finally {
        setLoading(false);
      }
    },
    [offset],
  );

  const fetchImpacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news-impact/history?limit=100");
      const data = await res.json();
      setImpacts(data || []);
    } catch (err) {
      console.error("Failed to fetch impacts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "feed") {
      fetchNews(true);
    } else if (viewMode === "impacts") {
      fetchImpacts();
    }
    // Clear search results when switching tabs
    if (viewMode !== "search") {
      setVectorResults([]);
      setSearchQuery("");
    }
  }, [viewMode, fetchNews, fetchImpacts]);

  // Vector search
  const performVectorSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/news/search?q=${encodeURIComponent(query)}&limit=10`,
      );
      const data = await res.json();
      setVectorResults(data.results || []);
    } catch (err) {
      console.error("Vector search failed:", err);
      setVectorResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performVectorSearch(searchQuery);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      fetchNews(false);
    }
  };

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Newspaper className="w-6 h-6 text-green-500" />
          <h1 className="text-xl font-bold text-white">News Feed</h1>
        </div>
        <span className="text-gray-600 text-sm">
          {articles.length} articles loaded
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 mb-4">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setViewMode(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              viewMode === tab.key
                ? "bg-white text-black"
                : "bg-dark-600 text-gray-300 hover:bg-dark-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search bar - only in search mode */}
      {viewMode === "search" && (
        <form onSubmit={handleSearch} className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Semantic search via AI (press Enter)..."
              className="w-full bg-dark-600 text-white text-sm pl-9 pr-9 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setVectorResults([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
            <Sparkles size={10} />
            Vector search powered by Qwen3 embeddings
          </p>
        </form>
      )}

      {/* Content */}
      {loading && articles.length === 0 && impacts.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
        </div>
      ) : viewMode === "impacts" ? (
        /* Impacts Grid */
        <div className="space-y-2">
          {impacts.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No market impacts found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {impacts.map((impact, i) => (
                <ImpactCard
                  key={`${impact.market_id}-${i}`}
                  impact={impact}
                  onClick={() => setSelectedImpact(impact)}
                />
              ))}
            </div>
          )}
        </div>
      ) : viewMode === "search" ? (
        /* Vector Search Results */
        <div className="space-y-3">
          {searching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-green-500 animate-spin" />
              <span className="ml-2 text-gray-400 text-sm">Searching...</span>
            </div>
          ) : vectorResults.length > 0 ? (
            vectorResults.map((result) => (
              <div key={result.id} className="bg-dark-400/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-green-400 text-xs font-medium">
                    {(result.score * 100).toFixed(0)}% match
                  </span>
                  <span className="text-gray-600 text-[10px]">
                    {result.date
                      ? new Date(result.date).toLocaleDateString()
                      : ""}
                  </span>
                </div>
                <p className="text-white text-sm mb-3">{result.summary}</p>
                {result.highlights && result.highlights.length > 0 && (
                  <ul className="space-y-1.5">
                    {result.highlights.slice(0, 5).map((h, i) => (
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
                {result.eventCount > 0 && (
                  <div className="mt-2 text-[10px] text-gray-600">
                    {result.eventCount} related market events
                  </div>
                )}
              </div>
            ))
          ) : searchQuery ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No results found</p>
              <p className="text-gray-600 text-xs mt-1">
                Try different keywords
              </p>
            </div>
          ) : (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Enter a query to search</p>
              <p className="text-gray-600 text-xs mt-1">
                Semantic search across news briefings
              </p>
            </div>
          )}
        </div>
      ) : (
        /* News Feed */
        <div className="space-y-2">
          {articles.length === 0 ? (
            <div className="text-center py-12">
              <Newspaper className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No articles found</p>
            </div>
          ) : (
            <>
              {articles.map((article) => (
                <NewsCard key={article.uuid} article={article} />
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full py-2 bg-dark-600 hover:bg-dark-500 text-gray-300 text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    "Load More"
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Impact Detail Modal */}
      {selectedImpact && (
        <ImpactDetailModal
          impact={selectedImpact}
          onClose={() => setSelectedImpact(null)}
        />
      )}
    </div>
  );
});

export default NewsView;
