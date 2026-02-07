// Types for DayInLifeView

export interface ModelSummary {
  modelId: string;
  modelName: string;
  summary: string;
  highlights: string[];
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  processingTime: number;
  error?: string;
}

export interface DayInLifeResult {
  date: string;
  newsCount: number;
  sources: Record<string, number>;
  summaries: ModelSummary[];
  consensusSentiment: string;
  timestamp: number;
}

export function getSentimentColor(sentiment: string): string {
  switch (sentiment) {
    case "bullish":
      return "text-green-400 bg-green-500/20";
    case "bearish":
      return "text-red-400 bg-red-500/20";
    case "neutral":
      return "text-gray-400 bg-gray-500/20";
    case "mixed":
      return "text-yellow-400 bg-yellow-500/20";
    default:
      return "text-gray-400 bg-gray-500/20";
  }
}

export function getSentimentEmoji(sentiment: string): string {
  switch (sentiment) {
    case "bullish":
      return "🐂";
    case "bearish":
      return "🐻";
    case "neutral":
      return "😐";
    case "mixed":
      return "🔀";
    default:
      return "❓";
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function getModelColor(modelId: string): string {
  if (modelId.includes("gemini")) return "text-blue-400 bg-blue-500/20";
  if (modelId.includes("claude")) return "text-orange-400 bg-orange-500/20";
  if (modelId.includes("gpt")) return "text-emerald-400 bg-emerald-500/20";
  if (modelId.includes("llama")) return "text-purple-400 bg-purple-500/20";
  return "text-gray-400 bg-gray-500/20";
}
