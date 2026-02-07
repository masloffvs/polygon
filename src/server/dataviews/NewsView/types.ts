// Shared types for NewsView
export interface NewsArticle {
  uuid: string;
  original_id: string;
  source: string;
  content: string;
  url: string;
  author: string;
  score: number;
  published_at: string;
  created_at: string;
}

export interface NewsImpact {
  market_id: string;
  title: string;
  ticker: string;
  volume_24hr: number;
  relevance: number;
  impact_score: number;
  prob: number;
  timestamp: string;
}

export interface NewsStats {
  total: number;
  sources: Record<string, number>;
  today: number;
  week: number;
}

export type ViewMode = "feed" | "impacts" | "search";

export const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: "feed", label: "News Feed" },
  { key: "impacts", label: "Market Impacts" },
  { key: "search", label: "Search" },
];

// Format date for display
export function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

// Truncate text
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

// Get source color
export function getSourceColor(source: string): string {
  const colors: Record<string, string> = {
    cryptopanic: "text-orange-400 bg-orange-500/20",
    newsapi: "text-blue-400 bg-blue-500/20",
    rss: "text-green-400 bg-green-500/20",
    twitter: "text-sky-400 bg-sky-500/20",
    telegram: "text-purple-400 bg-purple-500/20",
  };
  return colors[source.toLowerCase()] || "text-gray-400 bg-gray-500/20";
}

// Get impact color based on score
export function getImpactColor(score: number): string {
  if (score >= 0.8) return "text-red-400";
  if (score >= 0.6) return "text-orange-400";
  if (score >= 0.4) return "text-yellow-400";
  if (score >= 0.2) return "text-green-400";
  return "text-gray-400";
}
