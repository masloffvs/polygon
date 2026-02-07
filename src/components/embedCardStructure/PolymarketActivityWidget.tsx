import { DashboardCardWrapper } from "@/ui/components";
import NumberFlow from "@number-flow/react";
import * as d3 from "d3";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  X,
} from "lucide-react";
import type React from "react";
import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ActivityItem,
  usePolymarketStore,
} from "../../store/polymarketStore";

const CWDataTable = lazy(() =>
  import("../cryptowatch/DataTable").then((m) => ({
    default: m.CWDataTable,
  })),
);

// Based on PolymarketActivity.tsx but simplified for widget usage

const ITEMS_PER_PAGE = 20; // Fewer items for modal

const formatMoney = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);

const TimeCell = memo(({ timestamp }: { timestamp: string }) => {
  try {
    const date = new Date(timestamp);
    return (
      <span className="text-white/40 text-[10px] whitespace-nowrap font-numeric">
        {date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </span>
    );
  } catch {
    return <span className="text-white/20">-</span>;
  }
});
TimeCell.displayName = "TimeCell";

interface TreemapData {
  name: string;
  value: number; // Volume
  netFlow: number; // Buy - Sell
  children?: TreemapData[];
  marketObj?: any;
}

const TreemapWidget = ({
  data,
  height,
  className = "",
}: {
  data: TreemapData;
  height?: number;
  className?: string;
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !data.children?.length)
      return;

    // Get dimensions from container
    const width = containerRef.current.clientWidth;
    const h = height || containerRef.current.clientHeight;
    const padding = 2;

    // Clear previous
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create hierarchy
    const root = d3
      .hierarchy(data)
      .sum((d) => d.value)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // Define Treemap layout
    d3.treemap<TreemapData>().size([width, h]).padding(padding).round(true)(
      root,
    );

    // Color scale
    // Simple logic: Green if netFlow > 0, Red if netFlow < 0.
    const getColor = (d: d3.HierarchyRectangularNode<TreemapData>) => {
      const net = d.data.netFlow;
      // const volume = d.data.value;

      // Color logic mimicking "exchanges"
      // Strong Buy -> Bright Green
      // Sell -> Bright Red
      // Neutral/Mixed -> Grayish

      if (net > 0) return "#84cc16"; // lime-500
      if (net < 0) return "#ef4444"; // red-500
      return "#374151"; // Gray-700
    };

    // Draw Leaves
    const leaf = svg
      .selectAll("g")
      .data(root.leaves())
      .join("g")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    // Rectangles
    leaf
      .append("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .attr("fill", (d) => getColor(d))
      .attr("rx", 2)
      .attr("stroke", "#0b0c0f")
      .attr("stroke-width", 1)
      .style("opacity", 0.8)
      .on("mouseover", function () {
        d3.select(this).style("opacity", 1).attr("stroke", "#fff");
      })
      .on("mouseout", function () {
        d3.select(this).style("opacity", 0.8).attr("stroke", "#0b0c0f");
      });

    // Text Labels (Title)
    leaf
      .append("foreignObject")
      .attr("x", 4)
      .attr("y", 4)
      .attr("width", (d) => Math.max(0, d.x1 - d.x0 - 8))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0 - 8))
      .append("xhtml:div")
      .style("width", "100%")
      .style("height", "100%")
      .style("overflow", "hidden")
      .style("font-size", "10px")
      .style("line-height", "1.2")
      .style("color", "white")
      .style("font-family", "inherit")
      .style("pointer-events", "none")
      .html((d) => {
        // Only show text if box is big enough
        if (d.x1 - d.x0 < 50 || d.y1 - d.y0 < 30) return "";
        return `
               <div class="font-bold truncate">${d.data.name}</div>
               <div class="opacity-75">${formatMoney(d.data.value)}</div>
               <div class="opacity-50 text-[8px]">${d.data.netFlow > 0 ? "+" : ""}${formatMoney(d.data.netFlow)}</div>
             `;
      });

    // Tooltip (Simple Title)
    leaf
      .append("title")
      .text(
        (d) =>
          `${d.data.name}\nVolume: ${formatMoney(d.data.value)}\nNet Flow: ${formatMoney(d.data.netFlow)}`,
      );
  }, [data, height]);

  return (
    <div
      ref={containerRef}
      className={`w-full relative ${className}`}
      style={{ height: height ? height : "100%" }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={height || "100%"}
        className="rounded-sm block"
      />
      {(!data.children || data.children.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
          Waiting for market data...
        </div>
      )}
    </div>
  );
};

export const PolymarketActivityWidget: React.FC = () => {
  const { activities, fetchInitial, isLoading } = usePolymarketStore();
  const [showModal, setShowModal] = useState(false);

  // Modal pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = Math.ceil(activities.length / ITEMS_PER_PAGE);

  // Initial fetch
  useEffect(() => {
    fetchInitial();
    // Poll every 5s for updates if not viewing history in full page (which we are not anymore)
    const interval = setInterval(() => {
      fetchInitial();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchInitial]);

  // Aggregate Data for Treemap
  const treeMapData: TreemapData = useMemo(() => {
    const groups = new Map<
      string,
      { volume: number; net: number; title: string }
    >();

    activities.forEach((item) => {
      // Group by title (Market Name)
      const key = item.title;
      if (!groups.has(key)) {
        groups.set(key, { volume: 0, net: 0, title: key });
      }
      const g = groups.get(key)!;

      // Add Volume
      g.volume += item.usdcValue;

      // Add Net Flow
      if (item.side === "BUY") {
        g.net += item.usdcValue;
      } else {
        g.net -= item.usdcValue;
      }
    });

    // Top 30 markets
    const children = Array.from(groups.values())
      .map((g) => ({
        name: g.title,
        value: g.volume,
        netFlow: g.net,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 30);

    return {
      name: "root",
      value: 0,
      netFlow: 0,
      children,
    };
  }, [activities]);

  // Modal View Data - Paginated
  const modalData = useMemo(() => {
    const start = currentPage * ITEMS_PER_PAGE;
    return activities.slice(start, start + ITEMS_PER_PAGE);
  }, [activities, currentPage]);

  const _columns = useMemo(
    () => [
      {
        key: "side",
        header: "Side",
        width: "60px",
        render: (_: any, row: ActivityItem) => (
          <span
            className={`flex items-center gap-1 text-[10px] font-semibold ${row.side === "BUY" ? "text-lime-500" : "text-red-500"}`}
          >
            {row.side === "BUY" ? "BUY" : "SELL"}
          </span>
        ),
      },
      {
        key: "asset",
        header: "Market",
        render: (_: any, row: ActivityItem) => (
          <div className="flex flex-col min-w-0">
            <span
              className="text-white/90 text-[10px] truncate block font-medium"
              title={row.title}
            >
              {row.title}
            </span>
            <span className="text-white/50 text-[9px] truncate block">
              {row.outcome}
            </span>
          </div>
        ),
      },
      {
        key: "usdcValue",
        header: "Value",
        align: "right" as const,
        width: "70px",
        render: (_: any, row: ActivityItem) => (
          <span
            className={`text-[10px] font-numeric ${row.usdcValue > 1000 ? "text-orange-400" : "text-white/40"}`}
          >
            <NumberFlow
              value={Math.round(row.usdcValue)}
              format={{
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }}
            />
          </span>
        ),
      },
      {
        key: "timestamp",
        header: "Time",
        align: "right" as const,
        width: "70px",
        render: (_: any, row: ActivityItem) => (
          <TimeCell timestamp={row.timestamp} />
        ),
      },
    ],
    [],
  );

  return (
    <>
      <DashboardCardWrapper className="p-5 flex flex-col max-h-full overflow-hidden">
        {/* Header */}
        <h3
          className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setShowModal(true)}
        >
          <TrendingUp size={14} className="text-blue-500" />
          Polymarket Radar
        </h3>

        {/* Widget Content - Treemap */}
        <div className="flex-1 min-h-0 bg-transparent p-1">
          <TreemapWidget data={treeMapData} />
        </div>
      </DashboardCardWrapper>

      {/* Full Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-900/80 backdrop-blur-sm p-4">
          <div className="bg-dark-500 w-full max-w-6xl h-[85vh] flex flex-col rounded-xl shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 bg-dark-600 rounded-t-xl">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-900/20 rounded-lg">
                  <Activity className="text-blue-500" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Polymarket Radar
                  </h2>
                  <p className="text-xs text-white/50 uppercase">
                    Real-time market volume & activity
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-white/50 hover:text-white hover:bg-dark-400 rounded transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content - Split View */}
            <div className="flex-1 overflow-hidden flex divide-x divide-dark-400">
              {/* Left: Treemap (Larger) */}
              <div className="flex-1 p-4 flex flex-col min-w-0">
                <h3 className="text-xs font-semibold text-white/50 mb-2 uppercase">
                  Volume Heatmap (Top 30)
                </h3>
                <TreemapWidget
                  data={treeMapData}
                  className="flex-1 border border-[#222] bg-[#000]"
                />
              </div>

              {/* Right: Activity Table */}
              <div className="w-[450px] flex flex-col bg-[#050505]">
                <div className="px-4 py-3 border-b border-[#1a1a1a] flex justify-between items-center bg-[#0a0a0a]">
                  <div className="text-xs text-white/50">
                    Recent Activity
                  </div>
                  {/* Pagination */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/30">
                      {currentPage + 1}/{totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      className="p-1 border border-[#222] rounded hover:border-[#444] disabled:opacity-30 text-white/90"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={currentPage >= totalPages - 1}
                      className="p-1 border border-[#222] rounded hover:border-[#444] disabled:opacity-30 text-white/90"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-2">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-full text-white/50 text-xs">
                        Loading table...
                      </div>
                    }
                  >
                    <CWDataTable
                      columns={[
                        {
                          key: "side",
                          header: "S",
                          width: "30px",
                          render: (_: any, row: ActivityItem) => (
                            <span
                              className={`text-[9px] font-semibold ${row.side === "BUY" ? "text-lime-500" : "text-red-500"}`}
                            >
                              {row.side[0]}
                            </span>
                          ),
                        },
                        {
                          key: "asset",
                          header: "Market",
                          render: (_: any, row: ActivityItem) => (
                            <div className="flex flex-col min-w-0">
                              <span
                                className="text-white/90 text-[10px] truncate block font-medium"
                                title={row.title}
                              >
                                {row.title}
                              </span>
                            </div>
                          ),
                        },
                        {
                          key: "usdcValue",
                          header: "Val",
                          align: "right",
                          width: "60px",
                          render: (_: any, row: ActivityItem) => (
                            <span className="text-[10px] font-numeric text-white/40">
                              <NumberFlow
                                value={row.usdcValue}
                                format={{
                                  style: "currency",
                                  currency: "USD",
                                  notation: "compact",
                                  maximumFractionDigits: 1,
                                }}
                              />
                            </span>
                          ),
                        },
                      ]}
                      data={modalData}
                      keyField="id"
                      striped={false}
                      hoverable={true}
                      compact={true}
                      hidePagination={true}
                      className="h-full"
                    />{" "}
                  </Suspense>{" "}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
