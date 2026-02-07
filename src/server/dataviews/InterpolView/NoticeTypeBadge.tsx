import type { WantedNotice } from "./types";

const BADGE_CONFIG: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  "interpol-red": {
    bg: "bg-red-500/15",
    text: "text-red-400",
    label: "RED NOTICE",
  },
  "interpol-yellow": {
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    label: "YELLOW NOTICE",
  },
  "interpol-un": {
    bg: "bg-sky-500/15",
    text: "text-sky-400",
    label: "UN NOTICE",
  },
  "fbi-wanted": {
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    label: "FBI WANTED",
  },
};

export function NoticeTypeBadge({
  notice,
  size = "md",
}: {
  notice: WantedNotice;
  size?: "sm" | "md";
}) {
  const key = `${notice.source}-${notice.notice_type}`;
  const c = BADGE_CONFIG[key] || {
    bg: "bg-gray-500/20",
    text: "text-gray-400",
    label: notice.notice_type.toUpperCase(),
  };

  const sizeClass =
    size === "sm" ? "text-[7px] px-1.5 py-0.5" : "text-[9px] px-2 py-1";

  return (
    <span
      className={`font-bold tracking-wider rounded ${sizeClass} ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}
