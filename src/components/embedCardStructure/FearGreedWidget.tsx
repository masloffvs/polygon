import { DashboardCardWrapper } from "@/ui/components";
import NumberFlow from "@number-flow/react";
import { map, range } from "lodash-es";
import { TrendingDown, TrendingUp, Zap } from "lucide-react";
import React, { useEffect, useState } from "react";

interface CurrentFearGreedIndex {
  score: number;
  sentiment: string;
  btcPrice: number;
  btcVolume: number;
  date: string;
  timestamp: number;
  change24h: number | null;
  change7d: number | null;
}

interface WidgetProps {
  data?: CurrentFearGreedIndex;
}

export const FearGreedWidget = React.memo(
  ({ data: initialData }: WidgetProps) => {
    const [data, setData] = useState<CurrentFearGreedIndex | null>(
      initialData || null,
    );

    useEffect(() => {
      if (initialData) {
        setData(initialData);
        return; // Added return to skip setting up interval if controlled by props
      }

      const fetchSnapshot = async () => {
        try {
          const res = await fetch("/api/observable/snapshots");
          const json = await res.json();
          const cardData = json["fear-greed-card"];
          if (cardData) {
            setData(cardData);
          }
        } catch (e) {
          console.error("Failed to fetch fear-greed data", e);
        }
      };

      fetchSnapshot();
      const interval = setInterval(fetchSnapshot, 10000);
      return () => clearInterval(interval);
    }, [initialData]);

    if (!data) {
      return (
        <DashboardCardWrapper className="flex items-center justify-center text-white/40 text-[10px]">
          LOADING...
        </DashboardCardWrapper>
      );
    }

    // Determine color based on score
    // 0-24: Extreme Fear (Orange/Red)
    // 25-49: Fear (Yellow)
    // 50-74: Greed (Green)
    // 75-100: Extreme Greed (Blue/Cyan)

    let color = "bg-[#777]";
    let textColor = "text-[#777]";

    if (data.score < 25) {
      color = "bg-[#FF5722]";
      textColor = "text-[#FF5722]";
    } else if (data.score < 50) {
      color = "bg-[#FFC107]";
      textColor = "text-[#FFC107]";
    } else if (data.score < 75) {
      color = "bg-lime-500";
      textColor = "text-lime-500";
    } else {
      color = "bg-[#2196F3]";
      textColor = "text-[#2196F3]";
    }

    const totalSegments = 40;
    const filledSegments = Math.round((data.score / 100) * totalSegments);

    return (
      <DashboardCardWrapper className="p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/90 flex items-center gap-2 mb-4">
          <Zap size={14} className={textColor} />
          Market Sentiment
        </h3>

        <div className="flex items-center gap-6">
          {/* Radial Chart */}
          <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
            {map(range(0, totalSegments), (i) => {
              const rotate = (i * 360) / totalSegments;
              const active = i < filledSegments;
              return (
                <div
                  key={i}
                  className={`absolute w-[2px] h-2 left-1/2 top-0 origin-[50%_3rem] rounded-full transition-all duration-500 ${
                    active ? color : "bg-white/10"
                  }`}
                  style={{
                    transform: `translateX(-50%) rotate(${rotate}deg)`,
                  }}
                />
              );
            })}
            <div className="flex flex-col items-center justify-center text-center z-10">
              <span className={`text-2xl font-bold ${textColor}`}>
                <NumberFlow value={Math.round(data.score)} />
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-2 w-full">
            <div>
              <div className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">
                Sentiment
              </div>
              <div className={`text-sm font-bold ${textColor} uppercase`}>
                {data.sentiment.replace(/_/g, " ")}
              </div>
            </div>

            <div className="w-full bg-white/10 h-[1px] my-1" />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] text-white/50 uppercase">
                  BTC Price
                </div>
                <div className="text-[11px] text-white/90">
                  <NumberFlow
                    value={data.btcPrice}
                    format={{ style: "currency", currency: "USD" }}
                  />
                </div>
              </div>
              <div>
                <div className="text-[9px] text-white/50 uppercase">
                  24H Change
                </div>
                <div
                  className={`text-[11px] flex items-center gap-1 ${(data.change24h || 0) >= 0 ? "text-lime-500" : "text-[#FF5722]"}`}
                >
                  {(data.change24h || 0) >= 0 ? (
                    <TrendingUp size={10} />
                  ) : (
                    <TrendingDown size={10} />
                  )}
                  <NumberFlow
                    value={Math.abs(data.change24h || 0)}
                    format={{
                      style: "decimal",
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardCardWrapper>
    );
  },
);
