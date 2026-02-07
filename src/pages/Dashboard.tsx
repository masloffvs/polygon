import { lazy, Suspense, useEffect, useState } from "react";
import { isEqual, map, sumBy } from "lodash-es";
import { Activity, Database, FileText, Server } from "lucide-react";
import { usePolymarketStore } from "../store/polymarketStore";
import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

// Lazy imports
const ErrorBoundary = lazy(() => import("@/ui/components").then(m => ({ default: m.ErrorBoundary })));
const StatCard = lazy(() => import("@/ui/components").then(m => ({ default: m.StatCard })));
const BaseTool = lazy(() => import("@/ui/tools/base"));

// Lazy-loaded widgets for better initial load performance
const FearGreedWidget = lazy(() =>
  import("@/components/embedCardStructure/FearGreedWidget").then((m) => ({
    default: m.FearGreedWidget,
  })),
);
const GammaMarketsWidget = lazy(() =>
  import("@/components/embedCardStructure/GammaMarketsWidget").then((m) => ({
    default: m.GammaMarketsWidget,
  })),
);
const PolymarketActivityWidget = lazy(() =>
  import("@/components/embedCardStructure/PolymarketActivityWidget").then(
    (m) => ({
      default: m.PolymarketActivityWidget,
    }),
  ),
);
const MarketSnapshotWidget = lazy(() =>
  import("@/components/embedCardStructure/MarketSnapshotWidget").then((m) => ({
    default: m.MarketSnapshotWidget,
  })),
);
const PennyWhaleWidget = lazy(() =>
  import("@/components/embedCardStructure/PennyWhaleWidget").then((m) => ({
    default: m.PennyWhaleWidget,
  })),
);
const CryptoTreasuriesWidget = lazy(() =>
  import("../components/embedCardStructure/CryptoTreasuriesWidget").then(
    (m) => ({ default: m.CryptoTreasuriesWidget }),
  ),
);

const CryptoPredictionWidget = lazy(() =>
  import("../components/embedCardStructure/CryptoPredictionWidget").then(
    (m) => ({ default: m.CryptoPredictionWidget }),
  ),
);
const WhaleMonitorWidget = lazy(() =>
  import("../components/embedCardStructure/WhaleMonitorWidget").then((m) => ({
    default: m.WhaleMonitorWidget,
  })),
);
const WorldClockWidget = lazy(() =>
  import("../components/embedCardStructure/WorldClockWidget").then((m) => ({
    default: m.WorldClockWidget,
  })),
);
const NewsImpactWidget = lazy(() =>
  import("../components/embedCardStructure/NewsImpactWidget").then((m) => ({
    default: m.NewsImpactWidget,
  })),
);

// Widget loading fallback component
const WidgetLoader = () => (
  <div className="h-full w-full flex items-center justify-center bg-dark-500/40 rounded-xl">
    <div className="animate-pulse text-dark-50 text-xs font-mono">
      Loading...
    </div>
  </div>
);

import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

function DashboardComponent() {
  const [snapshots, setSnapshots] = useState<Record<string, any>>({});
  const [dbStats, setDbStats] = useState({
    totalSize: "0 B",
    totalRows: 0,
    topTable: "Loading...",
  });
  const { metrics } = usePolymarketStore();

  const dashboardStats = [
    {
      title: "POLYMARKET LIVE",
      value: metrics.tps.toFixed(2),
      status: "active" as const,
      statusText: "TPS",
      subtext: "Live Activity",
      icon: <Activity size={12} strokeWidth={2} />,
    },
    {
      title: "TOTAL STORAGE",
      value: dbStats.totalSize,
      status: "active" as const,
      statusText: "On Disk",
      subtext: "ClickHouse DB",
      icon: <Server size={12} strokeWidth={2} />,
    },
    {
      title: "TOTAL RECORDS",
      value:
        dbStats.totalRows > 1000000
          ? `${(dbStats.totalRows / 1000000).toFixed(1)}M`
          : `${(dbStats.totalRows / 1000).toFixed(1)}K`,
      status: "neutral" as const,
      statusText: "Rows",
      subtext: "Ingested Events",
      icon: <Database size={12} strokeWidth={2} />,
    },
    {
      title: "HEAVIEST TABLE",
      value: dbStats.topTable,
      status: "waiting" as const,
      statusText: "Largest",
      subtext: "Most Storage Used",
      icon: <FileText size={12} strokeWidth={2} />,
    },
  ];

  useEffect(() => {
    // Poll for snapshots
    const fetchSnapshots = async () => {
      try {
        const res = await fetch("/api/observable/snapshots");
        const data = await res.json();

        // Deep comparison to prevent unnecessary re-renders
        setSnapshots((prev) => {
          if (isEqual(prev, data)) return prev;

          // Optimization: Reuse object references for unchanged keys
          // This ensures that even if 'data' is a new object,
          // partial updates don't cause re-renders for unchanged widgets
          if (Object.keys(prev).length > 0) {
            const next = { ...data };
            let hasChanges = false;

            for (const key in next) {
              if (isEqual(prev[key], next[key])) {
                next[key] = prev[key]; // Keep old reference
              } else {
                hasChanges = true;
              }
            }

            // Also check if keys were removed
            if (
              !hasChanges &&
              Object.keys(prev).length === Object.keys(next).length
            ) {
              return prev;
            }
            return next;
          }

          return data;
        });
      } catch (err) {
        console.error("Failed to fetch snapshots", err);
      }
    };

    const fetchDbStats = async () => {
      try {
        const res = await fetch("/api/system/storage");
        const data = await res.json();
        if (Array.isArray(data)) {
          const totalBytes = sumBy(data, (item) => Number(item.size_bytes));
          const totalRows = sumBy(data, (item) => Number(item.rows));
          const topTable = data[0]?.table || "None";

          // Format bytes
          const units = ["B", "KB", "MB", "GB", "TB"];
          let size = totalBytes;
          let unitIndex = 0;
          while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
          }
          const formattedSize = `${size.toFixed(2)} ${units[unitIndex]}`;

          setDbStats({
            totalSize: formattedSize,
            totalRows,
            topTable,
          });
        }
      } catch (err) {
        console.error("Failed to fetch db stats", err);
      }
    };

    fetchSnapshots();
    fetchDbStats();
    const interval = setInterval(fetchSnapshots, 2000);
    // Poll DB stats less frequently (e.g., every 30s)
    const dbInterval = setInterval(fetchDbStats, 30000);

    return () => {
      clearInterval(interval);
      clearInterval(dbInterval);
    };
  }, []);

  return (
    <Suspense fallback={<WidgetLoader />}>
      <BaseTool title="">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {map(dashboardStats, (stat, i) => (
            <StatCard key={i} {...stat} status={stat.status as any} />
          ))}
        </div>

      {/* NEW: Infrastructure & Health Section (Clusters/WitTrack style) */}
      <div className="mb-6 relative">
        <h2 className="text-xs font-mono text-[#666] uppercase tracking-wider mb-3 flex items-center gap-2">
          <Server size={12} /> Infrastructure Overview
        </h2>
        <div className="grid grid-cols-3 gap-4 h-[320px] overflow-hidden">
          {/* Real Observable Card: Whale Monitor */}
          <Suspense fallback={<WidgetLoader />}>
            <ErrorBoundary title="Whale Monitor">
              <WhaleMonitorWidget data={snapshots["whale-monitor-card"]} />
            </ErrorBoundary>
          </Suspense>

          <Suspense fallback={<WidgetLoader />}>
            <ErrorBoundary title="Crypto Treasuries">
              <CryptoTreasuriesWidget
                data={snapshots["crypto-treasuries-card"]}
              />
            </ErrorBoundary>
          </Suspense>

          <Suspense fallback={<WidgetLoader />}>
            <ErrorBoundary title="Fear & Greed">
              <FearGreedWidget data={snapshots["fear-greed-card"]} />
            </ErrorBoundary>
          </Suspense>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Suspense fallback={<WidgetLoader />}>
          <ErrorBoundary title="Penny Whale">
            <PennyWhaleWidget data={snapshots["penny-whale-card"]} />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<WidgetLoader />}>
          <ErrorBoundary title="World Clock">
            <WorldClockWidget data={snapshots["world-clock-card"]} />
          </ErrorBoundary>
        </Suspense>
        {/* 
        <Suspense fallback={<WidgetLoader />}>
          <WhaleMonitorWidget data={snapshots["whale-monitor-card"]} />
        </Suspense> */}
      </div>

      {/* Matrix Snapshot Re-Inserted with Vector Impact */}
      <div className="mb-6 h-[400px] grid grid-cols-3 gap-4">
        {/* News Impact Card (1/3) */}
        <Suspense fallback={<WidgetLoader />}>
          <ErrorBoundary title="News Impact">
            <NewsImpactWidget data={snapshots["news-impact-card"]} />
          </ErrorBoundary>
        </Suspense>
        <Suspense fallback={<WidgetLoader />}>
          <ErrorBoundary title="Market Snapshot">
            <MarketSnapshotWidget data={snapshots["market-snapshot-card"]} />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<WidgetLoader />}>
          <ErrorBoundary title="Polymarket Activity">
            <PolymarketActivityWidget />
          </ErrorBoundary>
        </Suspense>
      </div>

      {/* Bottom Grid: Table + Sidebar */}
      <div className="grid grid-cols-3 gap-4">
        <Suspense fallback={<WidgetLoader />}>
          <ErrorBoundary title="Gamma Markets">
            <GammaMarketsWidget data={snapshots["gamma-markets-card"]} />
          </ErrorBoundary>
        </Suspense>

        <Suspense fallback={<WidgetLoader />}>
          <ErrorBoundary title="Crypto Prediction">
            <CryptoPredictionWidget
              data={snapshots["crypto-prediction-card"]}
            />
          </ErrorBoundary>
        </Suspense>
      </div>
    </BaseTool>
    </Suspense>
  );
}

export const Dashboard = withErrorBoundary(DashboardComponent, {
  title: "Dashboard",
});
