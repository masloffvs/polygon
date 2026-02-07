import { dataviewOf } from "@/server/utils/dataview.helpers";
import {
  AlertCircle,
  Brain,
  CheckCircle,
  Clock,
  Loader2,
  Newspaper,
  Search,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import {
  type DayInLifeResult,
  formatDuration,
  getModelColor,
  getSentimentColor,
  getSentimentEmoji,
  type ModelSummary,
} from "./types";

function ModelCard({ summary }: { summary: ModelSummary }) {
  const [expanded, setExpanded] = useState(false);
  const modelColor = getModelColor(summary.modelId);
  const sentimentColor = getSentimentColor(summary.sentiment);

  if (summary.error) {
    return (
      <div className="bg-dark-400/30 rounded-lg p-4 border border-red-500/30">
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-sm font-medium px-2 py-0.5 rounded ${modelColor}`}
          >
            {summary.modelName}
          </span>
          <span className="text-red-400 text-xs flex items-center gap-1">
            <AlertCircle size={12} />
            Error
          </span>
        </div>
        <p className="text-red-400/70 text-xs">{summary.error}</p>
      </div>
    );
  }

  return (
    <div className="bg-dark-400/30 rounded-lg p-4 hover:bg-dark-400/50 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-sm font-medium px-2 py-0.5 rounded ${modelColor}`}
        >
          {summary.modelName}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${sentimentColor}`}>
            {getSentimentEmoji(summary.sentiment)} {summary.sentiment}
          </span>
          <span className="text-gray-600 text-[10px] flex items-center gap-0.5">
            <Clock size={10} />
            {formatDuration(summary.processingTime)}
          </span>
        </div>
      </div>

      {/* Summary */}
      <p
        className={`text-gray-300 text-sm mb-3 ${expanded ? "" : "line-clamp-4"}`}
      >
        {summary.summary}
      </p>

      {summary.summary.length > 300 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-green-400 text-xs hover:underline mb-3"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {/* Highlights */}
      {summary.highlights.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-gray-600 uppercase tracking-wide">
            Key Highlights
          </div>
          <ul className="space-y-1">
            {summary.highlights.map((h, i) => (
              <li
                key={`${summary.modelId}-h-${i}`}
                className="text-gray-400 text-xs flex items-start gap-1.5"
              >
                <span className="text-green-500 mt-0.5">•</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export const DayInLifeView = dataviewOf(() => {
  const [date, setDate] = useState(() => {
    // Default to yesterday
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [result, setResult] = useState<DayInLifeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!date) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/day-in-life", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  // No result yet - show input form
  if (!result && !loading) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center">
        <Sparkles className="w-16 h-16 text-amber-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Day In Life</h2>
        <p className="text-gray-500 text-sm text-center max-w-md mb-6">
          Analyze all news from a specific day across multiple AI models for
          comprehensive market insights.
        </p>

        <div className="w-full max-w-sm space-y-4">
          <div>
            <label
              htmlFor="date-input"
              className="block text-gray-400 text-sm mb-1"
            >
              Select Date
            </label>
            <input
              id="date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-dark-500 border border-dark-400 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!date}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Search size={16} />
            Analyze Day
          </button>
        </div>

        <div className="mt-8 p-4 bg-dark-600 rounded-lg max-w-md">
          <h3 className="text-gray-300 text-sm font-medium mb-2">
            Models Used
          </h3>
          <ul className="text-gray-500 text-xs space-y-1">
            <li>
              • <span className="text-blue-400">Gemini 2.0 Flash</span>
            </li>
            <li>
              • <span className="text-orange-400">Claude 3.5 Haiku</span>
            </li>
            <li>
              • <span className="text-emerald-400">GPT-4o Mini</span>
            </li>
            <li>
              • <span className="text-purple-400">Llama 3.3 70B</span>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center">
        <Loader2 className="w-16 h-16 text-amber-400 animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">
          Analyzing {date}...
        </h2>
        <p className="text-gray-500 text-sm">
          Fetching news and querying 4 AI models. This may take up to 2 minutes.
        </p>
      </div>
    );
  }

  // Result view
  if (!result) {
    return <div className="min-h-screen" />;
  }

  const successfulSummaries = result.summaries.filter(
    (s: ModelSummary) => !s.error,
  );
  const failedSummaries = result.summaries.filter((s: ModelSummary) => s.error);

  return (
    <div className="min-h-screen p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-6 h-6 text-amber-400" />
          <h1 className="text-xl font-bold text-white">
            Day In Life: {result.date}
          </h1>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="ml-auto text-gray-500 hover:text-white text-sm"
          >
            ← New Analysis
          </button>
        </div>
        <p className="text-gray-500 text-sm">
          Multi-model analysis of {result.newsCount} news items
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {/* News Count */}
        <div className="bg-dark-500/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-500 text-[10px] mb-1">
            <Newspaper size={12} />
            Total News
          </div>
          <div className="text-2xl font-bold text-white">
            {result.newsCount}
          </div>
        </div>

        {/* Sources */}
        <div className="bg-dark-500/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-500 text-[10px] mb-1">
            <CheckCircle size={12} />
            Sources
          </div>
          <div className="text-2xl font-bold text-white">
            {Object.keys(result.sources).length}
          </div>
        </div>

        {/* Models Used */}
        <div className="bg-dark-500/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-500 text-[10px] mb-1">
            <Brain size={12} />
            Models
          </div>
          <div className="text-2xl font-bold text-white">
            {successfulSummaries.length}/{result.summaries.length}
          </div>
        </div>

        {/* Consensus */}
        <div className="bg-dark-500/50 rounded-lg p-3">
          <div className="text-gray-500 text-[10px] mb-1">Consensus</div>
          <div
            className={`text-xl font-bold ${getSentimentColor(result.consensusSentiment).split(" ")[0]}`}
          >
            {getSentimentEmoji(result.consensusSentiment)}{" "}
            {result.consensusSentiment}
          </div>
        </div>
      </div>

      {/* Source Breakdown */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-400 mb-2">
          News by Source
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(result.sources).map(([source, count]) => (
            <span
              key={source}
              className="bg-dark-500 text-gray-300 px-2 py-1 rounded text-xs"
            >
              {source}:{" "}
              <span className="text-white font-medium">{count as number}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Model Summaries */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-400">Model Analyses</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {result.summaries.map((summary: ModelSummary) => (
            <ModelCard key={summary.modelId} summary={summary} />
          ))}
        </div>
      </div>

      {/* Failed Models */}
      {failedSummaries.length > 0 && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
            <AlertCircle size={14} />
            {failedSummaries.length} model(s) failed
          </div>
          <p className="text-red-400/70 text-xs">
            {failedSummaries.map((s: ModelSummary) => s.modelName).join(", ")}
          </p>
        </div>
      )}

      {/* Timestamp */}
      <div className="mt-6 text-center text-gray-600 text-xs">
        Generated at {new Date(result.timestamp).toLocaleString()}
      </div>
    </div>
  );
});

export default DayInLifeView;
