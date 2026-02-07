import { ExternalLink, Newspaper } from "lucide-react";
import {
  formatTimeAgo,
  getSourceColor,
  type NewsArticle,
  truncate,
} from "./types";

export function NewsCard({
  article,
  compact = false,
}: {
  article: NewsArticle;
  compact?: boolean;
}) {
  const sourceClass = getSourceColor(article.source);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-dark-400/30 hover:bg-dark-400/50 rounded-lg p-3 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-dark-600 flex items-center justify-center flex-shrink-0">
          <Newspaper size={14} className="text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-white text-sm leading-snug ${compact ? "line-clamp-2" : "line-clamp-3"}`}
          >
            {truncate(article.content, compact ? 120 : 200)}
          </p>
          <div className="flex items-center gap-2 mt-2 text-[10px]">
            <span
              className={`px-1.5 py-0.5 rounded font-medium uppercase ${sourceClass}`}
            >
              {article.source}
            </span>
            <span className="text-gray-600">
              {formatTimeAgo(article.published_at)}
            </span>
            {article.author && (
              <span className="text-gray-600 truncate max-w-[100px]">
                by {article.author}
              </span>
            )}
          </div>
        </div>
        <ExternalLink
          size={12}
          className="text-gray-600 group-hover:text-white transition-colors flex-shrink-0 mt-1"
        />
      </div>
    </a>
  );
}
