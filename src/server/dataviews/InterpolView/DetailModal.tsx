import {
  AlertTriangle,
  Calendar,
  DollarSign,
  Eye,
  FileWarning,
  Globe,
  User,
  Users,
  X,
} from "lucide-react";
import { NoticeTypeBadge } from "./NoticeTypeBadge";
import { getDisplayName, type WantedNotice } from "./types";

export function DetailModal({
  notice,
  onClose,
}: {
  notice: WantedNotice;
  onClose: () => void;
}) {
  const displayName = getDisplayName(notice);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-900/90 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-dark-400 w-full max-w-4xl rounded-xl overflow-hidden max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="flex items-start gap-6 p-6 bg-dark-500">
          <div className="w-24 h-24 rounded-lg bg-dark-500 overflow-hidden flex-shrink-0">
            {notice.thumbnail_url ? (
              <img
                src={notice.thumbnail_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-10 h-10 text-dark-100" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <NoticeTypeBadge notice={notice} />
              <span className="text-xs text-gray-600 font-mono">
                {notice.source.toUpperCase()} ID: {notice.id}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {displayName}
            </h2>
            {notice.aliases && notice.aliases.length > 0 && (
              <p className="text-gray-500 text-sm">
                AKA: {notice.aliases.slice(0, 3).join(", ")}
                {notice.aliases.length > 3 &&
                  ` +${notice.aliases.length - 3} more`}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-500 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-2">
                    <Calendar size={12} />
                    DATE OF BIRTH
                  </div>
                  <p className="text-white font-medium">
                    {notice.date_of_birth || "Unknown"}
                  </p>
                </div>
                <div className="bg-dark-500 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-600 text-xs mb-2">
                    <Users size={12} />
                    GENDER
                  </div>
                  <p className="text-white font-medium">
                    {notice.sex === "M"
                      ? "Male"
                      : notice.sex === "F"
                        ? "Female"
                        : "Unknown"}
                  </p>
                </div>
              </div>

              {/* Nationalities */}
              {notice.nationalities.length > 0 && (
                <div>
                  <h4 className="text-xs text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Globe size={12} />
                    Nationalities
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {notice.nationalities.map((nat) => (
                      <span
                        key={nat}
                        className="text-xs bg-dark-600 text-gray-300 px-3 py-1.5 rounded-full"
                      >
                        {nat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Charges */}
              {notice.subjects.length > 0 && (
                <div>
                  <h4 className="text-xs text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FileWarning size={12} />
                    Charges / Categories
                  </h4>
                  <div className="space-y-2">
                    {notice.subjects.map((subj) => (
                      <div
                        key={subj}
                        className="text-sm bg-red-500/20 text-red-400 px-4 py-2 rounded-lg"
                      >
                        {subj}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Reward */}
              {notice.reward > 0 && (
                <div className="bg-green-500/20 rounded-lg p-5">
                  <h4 className="text-xs text-green-400 uppercase tracking-wider mb-2 font-bold flex items-center gap-2">
                    <DollarSign size={12} />
                    Reward Offered
                  </h4>
                  <p className="text-green-400 font-bold text-3xl font-mono">
                    ${notice.reward.toLocaleString()}
                  </p>
                  {notice.reward_text && (
                    <p className="text-green-300/60 text-sm mt-3 pt-3">
                      {notice.reward_text}
                    </p>
                  )}
                </div>
              )}

              {/* Description */}
              {notice.description && (
                <div>
                  <h4 className="text-xs text-gray-600 uppercase tracking-wider mb-3">
                    Physical Description
                  </h4>
                  <p className="text-gray-300 text-sm leading-relaxed bg-dark-500 p-4 rounded-lg">
                    {notice.description}
                  </p>
                </div>
              )}

              {/* Field Offices */}
              {notice.field_offices && notice.field_offices.length > 0 && (
                <div>
                  <h4 className="text-xs text-gray-600 uppercase tracking-wider mb-3">
                    Field Offices
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {notice.field_offices.map((office) => (
                      <span
                        key={office}
                        className="text-xs bg-purple-500/20 text-purple-400 px-3 py-1.5 rounded-full"
                      >
                        {office}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Caution */}
          {notice.caution && (
            <div className="mt-6 bg-red-500/20 rounded-lg p-5">
              <h4 className="text-xs text-red-400 uppercase tracking-wider mb-3 font-bold flex items-center gap-2">
                <AlertTriangle size={12} />
                Caution / Warning
              </h4>
              <p className="text-red-400 text-sm leading-relaxed whitespace-pre-wrap">
                {notice.caution.replace(/<[^>]*>/g, "")}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-dark-500 flex justify-between items-center">
          <span className="text-xs text-gray-600">
            Last updated: {new Date(notice.fetched_at).toLocaleDateString()}
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Close
            </button>
            {notice.detail_url && (
              <a
                href={notice.detail_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                  notice.source === "fbi"
                    ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                    : "bg-orange-500/20 text-orange-300 hover:bg-orange-500/30"
                }`}
              >
                <Eye size={14} />
                View Original
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
