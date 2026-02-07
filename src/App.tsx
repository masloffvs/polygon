import { ErrorBoundary, Sidebar } from "@/ui/components";
import {
  BookOpen,
  Clock3,
  Database,
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Workflow,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

const Configuration = lazy(() =>
  import("./pages/Configuration").then((m) => ({ default: m.Configuration })),
);
const DataStudio = lazy(() =>
  import("./pages/DataStudio").then((m) => ({ default: m.DataStudio })),
);
const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const WorldMapPage = lazy(() =>
  import("./pages/WorldMapPage").then((m) => ({ default: m.WorldMapPage })),
);

const PipelineGraph = lazy(() =>
  import("./pages/PipelineGraph").then((m) => ({ default: m.PipelineGraph })),
);
const Placeholder = lazy(() =>
  import("./pages/Placeholder").then((m) => ({ default: m.Placeholder })),
);
const SmartMoneyAnalysis = lazy(() =>
  import("./pages/SmartMoneyAnalysis").then((m) => ({
    default: m.SmartMoneyAnalysis,
  })),
);
const SmartMoneyHistory = lazy(() =>
  import("./pages/SmartMoneyHistory").then((m) => ({
    default: m.SmartMoneyHistory,
  })),
);
const DataViewPage = lazy(() =>
  import("./pages/DataViewPage").then((m) => ({ default: m.DataViewPage })),
);
const WalletFlow = lazy(() =>
  import("./pages/WalletFlow").then((m) => ({ default: m.WalletFlow })),
);
const CronTab = lazy(() =>
  import("./pages/CronTab").then((m) => ({ default: m.CronTab })),
);

import { socketService } from "./services/socket";
import { usePolygonMonitorStore } from "./store/polygonMonitorStore";
import { usePolymarketStore } from "./store/polymarketStore";

function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [socketStatus, setSocketStatus] = useState<
    "connected" | "disconnected" | "connecting"
  >("disconnected");
  const [latency, setLatency] = useState<number | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Store actions
  // NOTE: addPolymarketActivity removed - polling in PolymarketActivity.tsx handles data now
  const addPolygonEvent = usePolygonMonitorStore((state) => state.addEvent);
  const updatePolymarketMetrics = usePolymarketStore(
    (state) => state.updateMetrics,
  );

  useEffect(() => {
    // Initialize Global Socket
    socketService.connect();

    const onStatus = (status: any) => setSocketStatus(status);
    const onLatency = (lat: any) => setLatency(lat);

    // Global Data Handler
    // We listen to the topic name broadcasted by the aggregator
    const onPolymarketEvent = (payload: any) => {
      // NOTE: Polymarket activity is now handled by polling in PolymarketActivity.tsx
      // to avoid race conditions between WebSocket adds and polling replaces.
      // This handler is kept for metrics only.

      // Handle double wrapping if present { source: ..., data: { type: 'trade', ... } }
      const _evt = payload.data || payload;

      // Only process metrics, not trades (trades handled by polling)
      // Trades were causing duplicate rendering due to race with polling
    };

    const onPolymarketMetrics = (payload: any) => {
      // Unpack if necessary, similar to above.
      // Assuming payload IS the PolymarketMetric object or wrapped in { source, timestamp, data }
      const metric = payload.data || payload;
      updatePolymarketMetrics(metric);
    };

    socketService.on("latency", onLatency);
    // Use the 1k filtered stream for the main UI feed
    socketService.on("polymarket-filtered-1k", onPolymarketEvent);
    socketService.on("polymarket-metrics", onPolymarketMetrics);

    // Polygon Monitor Handler
    const onPolygonEvent = (payload: any) => {
      const evt = payload.data || payload;
      addPolygonEvent(evt);
    };
    // Listen to the processed stage output instead of raw source to ensure we get pipeline-validated data
    socketService.on("polygon-processed-events", onPolygonEvent);

    return () => {
      socketService.off("status", onStatus);
      socketService.off("latency", onLatency);
      socketService.off("polymarket-filtered-1k", onPolymarketEvent);
      socketService.off("polymarket-metrics", onPolymarketMetrics);
      socketService.off("polygon-processed-events", onPolygonEvent);
      socketService.disconnect();
    };
  }, [addPolygonEvent, updatePolymarketMetrics]); // Remove all dependencies as we just use the store hooks that are stable or we don't need to re-bind on their change

  // Determine active item based on current path
  const getActiveItem = (path: string) => {
    if (path === "/") return "dashboard";
    // dynamic path matching could go here
    return path.substring(1).split("/")[0];
  };

  const activeNav = getActiveItem(location.pathname);

  // Map sidebar IDs to routes
  const handleNavClick = (item: { id: string }) => {
    if (item.id === "dashboard") {
      navigate("/");
    } else {
      navigate(`/${item.id}`);
    }
  };

  return (
    <div className="flex h-screen w-full bg-dark text-gray-200 font-sans selection:bg-white selection:text-black overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        activeId={activeNav || "dashboard"}
        onItemClick={handleNavClick}
        footer={
          <div className="text-xs text-gray-500 font-mono">
            {socketStatus === "connected" && latency !== null
              ? `● ${latency}ms`
              : socketStatus === "connecting"
                ? "● ..."
                : "● Off"}
          </div>
        }
        items={[
          {
            id: "dashboard",
            label: "Dashboard",
            icon: <LayoutDashboard size={18} />,
          },
          {
            id: "datastudio",
            label: "Data Studio",
            icon: <Database size={18} />,
          },
          {
            id: "pipelines",
            label: "Pipelines",
            icon: <Workflow size={18} />,
          },
          {
            id: "smart-money",
            label: "Smart Money",
            icon: <TrendingUp size={18} />,
          },
          {
            id: "smart-money-history",
            label: "Smart Money History",
            icon: <BookOpen size={18} />,
          },
          {
            id: "wallet-flow",
            label: "Wallet Flow",
            icon: <Wallet size={18} />,
          },
          {
            id: "crontab",
            label: "CronTab",
            icon: <Clock3 size={18} />,
          },

          {
            id: "config",
            label: "Config",
            icon: <Workflow size={18} />,
          },
        ]}
      />

      <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-y-scroll overflow-x-hidden max-h-full bg-dark-900/50">
        {/* Content Rendered Here */}
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-pulse text-[#666666]">Loading...</div>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={
              <ErrorBoundary title="Dashboard">
                <Dashboard />
              </ErrorBoundary>
            }
          />
          <Route
            path="datastudio"
            element={
              <ErrorBoundary title="Data Studio">
                <DataStudio />
              </ErrorBoundary>
            }
          />
          <Route
            path="pipelines"
            element={
              <ErrorBoundary title="Pipelines">
                <PipelineGraph />
              </ErrorBoundary>
            }
          />
          <Route
            path="smart-money"
            element={
              <ErrorBoundary title="Smart Money">
                <SmartMoneyAnalysis />
              </ErrorBoundary>
            }
          />
          <Route
            path="smart-money-history"
            element={
              <ErrorBoundary title="Smart Money History">
                <SmartMoneyHistory />
              </ErrorBoundary>
            }
          />
          <Route
            path="wallet-flow"
            element={
              <ErrorBoundary title="Wallet Flow">
                <WalletFlow />
              </ErrorBoundary>
            }
          />
          <Route
            path="crontab"
            element={
              <ErrorBoundary title="CronTab">
                <CronTab />
              </ErrorBoundary>
            }
          />
          <Route
            path="world-map"
            element={
              <ErrorBoundary title="World Map">
                <WorldMapPage />
              </ErrorBoundary>
            }
          />

          <Route
            path="workflows"
            element={
              <ErrorBoundary title="Workflows">
                <Placeholder title="Workflows" />
              </ErrorBoundary>
            }
          />

          <Route
            path="config"
            element={
              <ErrorBoundary title="Configuration">
                <Configuration />
              </ErrorBoundary>
            }
          />
          <Route
            path="datastudio/view/:viewId"
            element={
              <ErrorBoundary title="DataView">
                <DataViewPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="*"
            element={
              <ErrorBoundary title="404">
                <Placeholder title="404 - Page Not Found" />
              </ErrorBoundary>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
