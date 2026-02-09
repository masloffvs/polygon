import type React from "react";
import { type NodeRendererProps, registerRenderer } from "./registry";

const TelegramAdsPublishRenderer: React.FC<NodeRendererProps> = ({
  data,
  nodeData,
}) => {
  const result = data?.result?.value;
  const error = data?.error?.value;
  const settings = nodeData?.settings || {};

  const title = settings.title || "Not set";
  const text = settings.text || "";
  const promoteUrl = settings.promoteUrl || "Not set";
  const cpm = settings.cpm ?? 0.1;
  const budget = settings.budget ?? 0.1;
  const dailyBudget = settings.dailyBudget ?? 0;
  const active = settings.active === "1";
  const targetType = settings.targetType || "channels";
  const channels = settings.channels || "";
  const hasAuth = !!(settings.apiHash && settings.stelToken && settings.stelAdowner);

  // Count target channels
  const channelCount = channels ? channels.split(";").filter(Boolean).length : 0;

  // Truncate text for preview
  const textPreview = text.length > 80 ? text.slice(0, 80) + "..." : text;

  return (
    <div className="flex flex-col gap-2 p-2 w-full min-w-[280px]">
      {/* Auth Status */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${hasAuth ? "bg-green-500" : "bg-red-500"}`}
        />
        <span className="text-[9px] text-gray-400">
          {hasAuth ? "Authenticated" : "Auth Required"}
        </span>
        <span
          className={`ml-auto text-[9px] px-1.5 py-0.5 rounded ${
            active
              ? "bg-green-500/20 text-green-400"
              : "bg-yellow-500/20 text-yellow-400"
          }`}
        >
          {active ? "ACTIVE" : "DRAFT"}
        </span>
      </div>

      {/* Ad Preview Card */}
      <div className="bg-dark-800/60 rounded-lg p-2.5 border border-dark-700">
        <div className="text-[11px] font-medium text-white mb-1 truncate">
          {title}
        </div>
        {textPreview && (
          <div className="text-[10px] text-gray-400 leading-relaxed mb-2">
            {textPreview}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[9px]">
          <span className="text-blue-400">🔗</span>
          <span className="text-blue-400 truncate">{promoteUrl}</span>
        </div>
      </div>

      {/* Budget & Targeting */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div className="flex justify-between">
          <span className="text-gray-500">CPM:</span>
          <span className="text-emerald-400 font-mono">€{cpm}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Budget:</span>
          <span className="text-emerald-400 font-mono">€{budget}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Daily:</span>
          <span className="text-gray-300 font-mono">
            {dailyBudget > 0 ? `€${dailyBudget}` : "∞"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Target:</span>
          <span className="text-cyan-400 capitalize">{targetType}</span>
        </div>
      </div>

      {/* Channels Count */}
      {targetType === "channels" && (
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-500">Channels:</span>
          <span className="text-purple-400 font-mono">{channelCount}</span>
          {channelCount > 0 && (
            <span className="text-gray-600 truncate flex-1 text-right font-mono">
              {channels.split(";").slice(0, 3).join(", ")}
              {channelCount > 3 && "..."}
            </span>
          )}
        </div>
      )}

      {/* Result Display */}
      {result?.success ? (
        <div className="bg-green-900/20 rounded p-2 mt-1">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-green-400">✓</span>
            <span className="text-green-300">Ad Created</span>
            {result.ad_id && (
              <span className="ml-auto text-gray-500 font-mono">
                #{result.ad_id}
              </span>
            )}
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-900/20 rounded p-2 mt-1">
          <div className="text-[10px] text-red-400">
            ✗ {error.message || error.code || "Failed"}
          </div>
          {error.status && (
            <div className="text-[9px] text-red-500/70 mt-0.5">
              HTTP {error.status}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-gray-600 italic text-center py-1">
          Ready to publish
        </div>
      )}
    </div>
  );
};

registerRenderer("telegram-ads-publish", TelegramAdsPublishRenderer);
export default TelegramAdsPublishRenderer;
