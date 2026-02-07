import { dataviewOf } from "@/server/utils/dataview.helpers";
import {
    AlertTriangle,
    FileWarning,
    Filter,
    Loader2,
    Search,
    Users,
    X,
} from "lucide-react";
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import { PersonCard } from "./PersonCard";
import { StatCard } from "./StatCard";
import {
    FILTER_BUTTONS,
    type FilterType,
    type WantedNotice,
    type WantedStats,
} from "./types";

const DetailModal = lazy(() =>
  import("./DetailModal").then((m) => ({ default: m.DetailModal })),
);

export const InterpolView = dataviewOf(() => {
  const [notices, setNotices] = useState<WantedNotice[]>([]);
  const [stats, setStats] = useState<WantedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [selectedNotice, setSelectedNotice] = useState<WantedNotice | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams({
        offset: offset.toString(),
        limit: limit.toString(),
      });
      if (searchQuery) params.set("search", searchQuery);
      if (activeFilter !== "all") params.set("source", activeFilter);

      const res = await fetch(`/api/wanted/notices?${params}`);
      const json = await res.json();
      setNotices(json.data || []);
      if (json.stats) setStats(json.stats);
      setTotalPages(Math.ceil((json.stats?.total || json.data?.length || 0) / limit));
    } catch (err) {
      console.error("Failed to fetch notices:", err);
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeFilter, page]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchNotices();
  };

  const filteredNotices = useMemo(() => {
    return notices;
  }, [notices]);

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h1 className="text-xl font-bold text-white">Wanted Notices</h1>
        </div>
        <p className="text-gray-500 text-sm">
          Interpol & FBI Database
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <StatCard
            icon={Users}
            label="Total"
            value={stats.total}
            iconColor="text-blue-400"
          />
          <StatCard
            icon={AlertTriangle}
            label="Red"
            value={stats.interpol_red}
            iconColor="text-red-500"
          />
          <StatCard
            icon={AlertTriangle}
            label="Yellow"
            value={stats.interpol_yellow}
            iconColor="text-yellow-400"
          />
          <StatCard
            icon={FileWarning}
            label="UN"
            value={stats.interpol_un}
            iconColor="text-sky-400"
          />
          <StatCard
            icon={FileWarning}
            label="FBI"
            value={stats.fbi_wanted}
            iconColor="text-purple-400"
          />
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-dark-400/30 rounded-lg p-3 mb-4">
        <form onSubmit={handleSearch} className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, nationality, charges..."
              className="w-full bg-dark-600 text-white text-sm pl-9 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-dark-600 hover:bg-dark-500 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Search
          </button>
        </form>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-gray-500" />
          {FILTER_BUTTONS.map((filter) => (
            <button
              type="button"
              key={filter.key}
              onClick={() => {
                setActiveFilter(filter.key);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                activeFilter === filter.key
                  ? `${filter.color} text-white`
                  : "bg-dark-600 text-gray-300 hover:bg-dark-500"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : filteredNotices.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No notices found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2">
            {filteredNotices.map((notice) => (
              <PersonCard
                key={`${notice.source}-${notice.id}`}
                notice={notice}
                onClick={() => setSelectedNotice(notice)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm bg-dark-600 hover:bg-dark-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Prev
              </button>
              <span className="text-gray-500 text-sm px-2">
                {page}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm bg-dark-600 hover:bg-dark-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {selectedNotice && (
        <Suspense
          fallback={
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          }
        >
          <DetailModal
            notice={selectedNotice}
            onClose={() => setSelectedNotice(null)}
          />
        </Suspense>
      )}
    </div>
  );
});

export default InterpolView;
