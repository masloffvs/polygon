import { type Column } from "@/components/cryptowatch/DataTable";
import { NumericFont } from "@/ui/components";
import {
  Activity,
  Calendar,
  Filter,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import useSWR from "swr";

const CWDataTable = lazy(() =>
  import("@/components/cryptowatch/DataTable").then((m) => ({
    default: m.CWDataTable,
  })),
);
const SmartMoneyHistoryChart = lazy(() =>
  import("@/components/cryptowatch/SmartMoneyHistoryChart").then((m) => ({
    default: m.SmartMoneyHistoryChart,
  })),
);

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const toNumber = (value: unknown) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const HistorySection = () => {
  const { data: realData } = useSWR("/api/predictions/history", fetcher, {
    refreshInterval: 60000,
  });

  const [selectedAsset, setSelectedAsset] = useState("ALL");

  // Use real data if available
  const history = (realData?.global || [])
    .map((d: any) => {
      const accuracy = toNumber(d.accuracy);
      return {
        ...d,
        accuracy,
        volume: toNumber(d.volume) ?? 0,
        longRatio: toNumber(d.longRatio) ?? 0,
        windowStart: new Date(d.windowStart),
        windowEnd: d.windowEnd ? new Date(d.windowEnd) : undefined,
      };
    })
    .filter((point: any) => point.accuracy !== null)
    .sort(
      (a: any, b: any) => a.windowStart.getTime() - b.windowStart.getTime(),
    );

  // Parse trader data if available
  const traderHistory = realData?.traders
    ? Object.fromEntries(
        Object.entries(realData.traders).map(([key, points]: [string, any]) => [
          key,
          points.map((p: any) => ({
            date: new Date(p.date),
            accuracy: toNumber(p.accuracy) ?? 0,
          })),
        ]),
      )
    : undefined;

  // Parse asset data if available
  const assetHistory = realData?.assets
    ? Object.fromEntries(
        Object.entries(realData.assets).map(([key, points]: [string, any]) => [
          key,
          points.map((p: any) => {
            const price = toNumber(p.price);
            return {
              date: new Date(p.date),
              accuracy: toNumber(p.accuracy) ?? 0,
              price: price ?? undefined,
            };
          }),
        ]),
      )
    : undefined;

  // Data for table (Newest first)
  const tableData = [...history].reverse();

  // Generate dynamic columns for each asset
  const assetColumns: Column<any>[] = assetHistory
    ? Object.keys(assetHistory)
        .sort()
        .map((asset) => ({
          key: `asset-${asset}`,
          header: asset,
          render: (_, row) => {
            // Find the data point for this asset at this time
            const point = assetHistory[asset].find(
              (p: any) =>
                Math.abs(p.date.getTime() - row.windowStart.getTime()) < 5000,
            );

            if (!point) return <span className="text-gray-600">-</span>;

            return (
              <NumericFont
                className={`text-xs ${
                  point.accuracy >= 50 ? "text-green-400" : "text-red-400"
                }`}
              >
                {point.accuracy.toFixed(0)}%
              </NumericFont>
            );
          },
        }))
    : [];

  const columns: Column<any>[] = [
    {
      key: "windowStart",
      header: "Time",
      render: (val: Date) => (
        <span className="text-gray-400 font-numeric text-[10px]">
          {val.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "accuracy",
      header: "Model Acc",
      render: (val: number, _row, index) => {
        const prev = tableData[index + 1];
        const change = prev ? val - prev.accuracy : 0;
        return (
          <div className="flex items-center gap-2">
            <NumericFont
              className={`font-bold text-xs ${
                val >= 50 ? "text-gray-100" : "text-red-400"
              }`}
            >
              {val.toFixed(1)}%
            </NumericFont>
            {change !== 0 && (
              <NumericFont
                className={`text-[9px] ${
                  change > 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {change > 0 ? "↑" : "↓"}
              </NumericFont>
            )}
          </div>
        );
      },
    },
    ...assetColumns,
    {
      key: "volume",
      header: "Vol",
      render: (val: number) => (
        <NumericFont className="text-gray-400 text-xs">
          ${(val / 1000).toFixed(0)}K
        </NumericFont>
      ),
    },
  ];

  const averageAccuracy =
    history.length > 0
      ? history.reduce((a: any, b: any) => a + b.accuracy, 0) / history.length
      : 0;

  const winRateTrend =
    history.length > 1
      ? history[history.length - 1].accuracy -
        history[history.length - 2].accuracy
      : 0;

  const totalVol = history.reduce((a: any, b: any) => a + b.volume, 0);

  return (
    <div className="grid grid-cols-12 gap-6 pb-6 pt-6 border-t border-dark-700">
      {/* Left: Chart & Stats (8 cols) */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
        {/* KPI Cards Strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-dark-400/30 border border-dark-700 rounded-xl p-3 flex items-center justify-between group hover:border-dark-600 transition-colors">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-mono mb-1">
                Avg Accuracy
              </div>
              <NumericFont
                className={`text-xl font-bold ${averageAccuracy >= 50 ? "text-green-400" : "text-gray-400"}`}
              >
                {averageAccuracy.toFixed(1)}%
              </NumericFont>
            </div>
            <Activity
              className={
                averageAccuracy >= 50 ? "text-green-400" : "text-gray-500"
              }
              size={20}
            />
          </div>

          <div className="bg-dark-400/30 border border-dark-700 rounded-xl p-3 flex items-center justify-between group hover:border-dark-600 transition-colors">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-mono mb-1">
                Total Volume
              </div>
              <NumericFont className="text-xl font-bold text-white">
                ${(totalVol / 1000000).toFixed(1)}M
              </NumericFont>
            </div>
            <Filter className="text-blue-500" size={20} />
          </div>

          <div className="bg-dark-400/30 border border-dark-700 rounded-xl p-3 flex items-center justify-between group hover:border-dark-600 transition-colors">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-mono mb-1">
                Trend (24h)
              </div>
              <NumericFont
                className={`text-xl font-bold ${winRateTrend > 0 ? "text-green-400" : "text-red-400"}`}
              >
                {winRateTrend > 0 ? "+" : ""}
                {winRateTrend.toFixed(1)}%
              </NumericFont>
            </div>
            {winRateTrend > 0 ? (
              <TrendingUp className="text-green-400" size={20} />
            ) : (
              <TrendingDown className="text-red-400" size={20} />
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 min-h-[300px] bg-dark-400/30 border border-dark-700 rounded-xl relative p-4 group hover:border-dark-600 transition-colors">
          <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-dark-600" />
          <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-dark-600" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-dark-600" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-dark-600" />

          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-mono font-bold text-gray-400 uppercase flex items-center gap-2">
              <Calendar size={14} /> Historical Accuracy
            </h3>

            <div className="flex gap-2">
              {assetHistory &&
                Object.keys(assetHistory).map((asset) => (
                  <button
                    key={asset}
                    onClick={() =>
                      setSelectedAsset(selectedAsset === asset ? "ALL" : asset)
                    }
                    className={`text-[10px] px-2 py-1 border rounded font-mono uppercase transition-colors ${selectedAsset === asset ? "bg-white text-black border-white" : "text-gray-500 border-dark-600 hover:border-gray-500"}`}
                  >
                    {asset}
                  </button>
                ))}
            </div>
          </div>

          <div className="w-full h-[250px]">
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-dark-400/20 rounded text-white/50 text-xs font-mono">
                  Loading chart...
                </div>
              }
            >
              <SmartMoneyHistoryChart
                data={history}
                traderData={traderHistory}
                assetData={assetHistory}
                selectedAsset={
                  selectedAsset === "ALL" ? undefined : selectedAsset
                }
                height={250}
                width={undefined} // Auto-width
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Right: History Table (4 cols) */}
      <div className="col-span-12 lg:col-span-4 flex flex-col h-[420px] bg-dark-400/30 border border-dark-700 rounded-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-dark-600" />
        <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-dark-600" />

        <div className="p-3 border-b border-dark-700 bg-dark-400/50 flex justify-between items-center">
          <span className="text-xs font-mono font-bold text-gray-400 uppercase">
            Prediction Log
          </span>
        </div>

        <div className="flex-1 overflow-hidden p-1">
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-dark-400/20 rounded text-white/50 text-xs font-mono">
                Loading table...
              </div>
            }
          >
            <CWDataTable
              data={tableData}
              columns={columns}
              isLoading={!realData}
              compact
              hidePagination
              className="h-full"
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default HistorySection;
