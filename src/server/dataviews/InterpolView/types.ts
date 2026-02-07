// Shared types for InterpolView
export interface WantedNotice {
  id: string;
  source: "interpol" | "fbi";
  notice_type: string;
  name: string;
  forename: string;
  title: string;
  description: string;
  date_of_birth: string;
  sex: string;
  nationalities: string[];
  thumbnail_url: string;
  detail_url: string;
  reward: number;
  reward_text: string;
  caution: string;
  subjects: string[];
  field_offices: string[];
  aliases: string[];
  fetched_at: string;
}

export interface WantedStats {
  interpol_red: number;
  interpol_yellow: number;
  interpol_un: number;
  fbi_wanted: number;
  total: number;
}

export type FilterType = "all" | "interpol" | "fbi";

export const FILTER_BUTTONS: {
  key: FilterType;
  label: string;
  color: string;
}[] = [
  { key: "all", label: "All", color: "bg-gray-500" },
  { key: "interpol", label: "Interpol", color: "bg-orange-500" },
  { key: "fbi", label: "FBI", color: "bg-purple-500" },
];

export function getDisplayName(notice: WantedNotice): string {
  return notice.source === "fbi"
    ? notice.title || notice.name || "Unknown"
    : [notice.forename, notice.name].filter(Boolean).join(" ") || "Unknown";
}
