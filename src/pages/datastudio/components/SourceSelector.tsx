import { useEffect, useState } from "react";

interface SourceSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

interface SourceChannel {
  id: string;
  name: string;
  description?: string;
}

export const SourceSelector = ({ value, onChange }: SourceSelectorProps) => {
  const [sources, setSources] = useState<SourceChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/datastudio/sources")
      .then((res) => res.json())
      .then((data) => {
        setSources(data.sources || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch sources:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-gray-500">
        Loading sources...
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-dark-900/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-all appearance-none cursor-pointer"
    >
      <option value="">Select a source...</option>
      {sources.map((source) => (
        <option key={source.id} value={source.id}>
          {source.name || source.id}
        </option>
      ))}
    </select>
  );
};
