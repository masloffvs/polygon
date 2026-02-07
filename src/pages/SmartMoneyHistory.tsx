import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type {
  RealTimeState,
  SymbolHistoryData,
  SymbolState,
} from "./smart-money/types";
import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

// Lazy imports
const NumericFont = lazy(() => import("@/ui/components").then(m => ({ default: m.NumericFont })));
const PredictionScatterPlot = lazy(() => import("./smart-money/components/PredictionScatterPlot"));
const SymbolDetails = lazy(() => import("./smart-money/components/SymbolDetails"));
const TopOpportunities = lazy(() => import("./smart-money/components/TopOpportunities"));
const WeightDistribution = lazy(() => import("./smart-money/components/WeightDistribution"));

const fetcher = (url: string) => fetch(url).then((res) => res.json());

import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

const SmartMoneyHistoryComponent = () => {
  const { data: state } = useSWR<RealTimeState>(
    "/api/predictions/realtime",
    fetcher,
    {
      refreshInterval: 5000,
    },
  );

  const symbols = state?.symbols ?? [];
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const { data: historyData } = useSWR<SymbolHistoryData>(
    selectedSymbol ? `/api/predictions/symbol-history/${selectedSymbol}` : null,
    fetcher,
    {
      refreshInterval: 60000,
    },
  );

  useEffect(() => {
    if (symbols.length === 0) return;
    if (!selectedSymbol) {
      setSelectedSymbol(symbols[0].symbol);
      return;
    }
    if (!symbols.some((s) => s.symbol === selectedSymbol)) {
      setSelectedSymbol(symbols[0].symbol);
    }
  }, [symbols, selectedSymbol]);

  const selected = useMemo(
    () => symbols.find((s) => s.symbol === selectedSymbol) ?? null,
    [symbols, selectedSymbol],
  );

  const opportunities = useMemo(() => [...symbols], [symbols]);

  if (!state) {
    return (
      <div className="flex bg-dark-900/50 p-6 h-full items-center justify-center">
        <div className="text-sm text-gray-500 font-mono animate-pulse">
          Loading history...
        </div>
      </div>
    );
  }

  const windowEnd = new Date(state.windowStart + 15 * 60 * 1000);
  const timeRemaining = Math.max(0, windowEnd.getTime() - Date.now());
  const formattedRemaining = new Date(timeRemaining)
    .toISOString()
    .substr(14, 5);

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-sm text-gray-500 font-mono animate-pulse">Loading...</div></div>}>
    <div className="flex flex-col h-full p-4 overflow-y-auto custom-scrollbar">
      <div className="mb-4 flex items-center justify-between bg-dark-400/30 border border-dark-700 rounded-lg px-4 py-3">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-500">View</span>
            <span className="text-base font-bold text-gray-100 font-mono">
              History
            </span>
          </div>
          <div className="w-px h-5 bg-dark-600" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-500">Phase</span>
            <span className="text-base font-bold text-yellow-400 font-mono">
              {state.currentPhase}
            </span>
          </div>
          <div className="w-px h-5 bg-dark-600" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-500">Threshold</span>
            <span className="text-base font-bold text-gray-100 font-mono">
              &gt;={state.threshold}%
            </span>
          </div>
          <div className="w-px h-5 bg-dark-600" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-500">Window</span>
            <NumericFont className="text-base font-bold text-gray-100">
              {formattedRemaining}
            </NumericFont>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
          <span>
            Symbols{" "}
            <NumericFont className="text-gray-200">
              {symbols.length}
            </NumericFont>
          </span>
          <span className="w-px h-4 bg-dark-600" />
          <span>
            Selected{" "}
            <span className="text-gray-100 font-bold">
              {selected?.symbol ?? "-"}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8 flex flex-col gap-4 min-h-0">
          <PredictionScatterPlot
            data={symbols}
            onSelect={(sym: SymbolState) => setSelectedSymbol(sym.symbol)}
            height={320}
          />
          <div className="h-[70vh] min-h-[520px]">
            {selected ? (
              <SymbolDetails
                symbol={selected}
                state={state}
                currentPhase={state.currentPhase}
                threshold={state.threshold}
                historyData={historyData ?? null}
              />
            ) : (
              <div className="bg-dark-400/30 border border-dark-700 rounded-xl h-full flex items-center justify-center text-sm text-gray-500 font-mono">
                No symbols available yet.
              </div>
            )}
          </div>
        </div>
        <div className="col-span-12 xl:col-span-4 flex flex-col gap-4">
          <TopOpportunities
            symbols={opportunities}
            onSelect={(sym) => setSelectedSymbol(sym.symbol)}
          />
          <WeightDistribution
            currentPhase={state.currentPhase}
            predictions={historyData?.predictions}
          />
        </div>
      </div>
    </div>
    </Suspense>
  );
};

export const SmartMoneyHistory = withErrorBoundary(SmartMoneyHistoryComponent, {
  title: "Smart Money History",
});

export default SmartMoneyHistory;
