import { DollarSign, ExternalLink, User } from "lucide-react";
import { NoticeTypeBadge } from "./NoticeTypeBadge";
import { getDisplayName, type WantedNotice } from "./types";

export function PersonCard({
  notice,
  onClick,
}: {
  notice: WantedNotice;
  onClick: () => void;
}) {
  const displayName = getDisplayName(notice);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group bg-dark-400/30 hover:bg-dark-400/60 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 text-left w-full"
    >
      {/* Image - clean, no overlays on face */}
      <div className="aspect-[4/5] bg-dark-500 relative overflow-hidden">
        {notice.thumbnail_url ? (
          <img
            src={notice.thumbnail_url}
            alt=""
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <User className="w-8 h-8 text-dark-100" />
          </div>
        )}
      </div>

      {/* Info footer - all metadata here */}
      <div className="p-2 bg-dark-500/50 space-y-1">
        <h3 className="text-white font-medium text-[11px] leading-tight line-clamp-1">
          {displayName}
        </h3>
        <div className="flex items-center justify-between gap-1">
          <NoticeTypeBadge notice={notice} size="sm" />
          {notice.reward > 0 && (
            <span className="bg-green-500/20 text-green-400 text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <DollarSign size={7} />${(notice.reward / 1000).toFixed(0)}K
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[8px] text-gray-600">
          <span className="font-mono uppercase">
            {notice.source} • {notice.id.slice(0, 6)}
          </span>
          <ExternalLink
            size={9}
            className="group-hover:text-white transition-colors"
          />
        </div>
      </div>
    </button>
  );
}
