import { Plus, Save } from "lucide-react";
import type { FormEvent } from "react";

export interface FormState {
  id?: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  timeoutMs: number;
}

interface TaskEditorProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onReset: () => void;
  saving: boolean;
  isEditing: boolean;
}

const PRESETS: Array<{
  label: string;
  schedule: string;
  command: string;
}> = [
  {
    label: "Every 5 minutes",
    schedule: "*/5 * * * *",
    command: "curl -s https://api.ipify.org",
  },
  {
    label: "Every hour",
    schedule: "0 * * * *",
    command: "date",
  },
  {
    label: "Wednesday 10:00",
    schedule: "0 10 * * 3",
    command: "curl -s https://api.github.com/zen",
  },
  {
    label: "Daily at 09:30",
    schedule: "30 9 * * *",
    command: "echo 'daily task'",
  },
];

export function TaskEditor({
  form,
  setForm,
  onSubmit,
  onReset,
  saving,
  isEditing,
}: TaskEditorProps) {
  return (
    <div className="bg-dark-800/40 backdrop-blur-sm rounded-xl p-6">
      <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">
        Task Editor
      </h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                schedule: preset.schedule,
                command: preset.command,
              }))
            }
            className="px-3 py-1.5 rounded-lg text-xs bg-dark-700/60 hover:bg-dark-600/60 text-gray-300 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-gray-500 font-mono uppercase tracking-wide mb-2 block">
              Name
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full rounded-lg bg-dark-900/50 px-4 py-2.5 text-sm text-gray-100 outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
              placeholder="e.g. Wednesday Sync"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 font-mono uppercase tracking-wide mb-2 block">
              Cron Expression
            </span>
            <input
              type="text"
              value={form.schedule}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, schedule: e.target.value }))
              }
              className="w-full rounded-lg bg-dark-900/50 px-4 py-2.5 text-sm text-gray-100 font-mono outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
              placeholder="*/5 * * * *"
              required
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs text-gray-500 font-mono uppercase tracking-wide mb-2 block">
            Bash Command
          </span>
          <textarea
            value={form.command}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, command: e.target.value }))
            }
            className="w-full min-h-[100px] rounded-lg bg-dark-900/50 px-4 py-2.5 text-sm text-gray-100 font-mono outline-none focus:ring-2 focus:ring-amber-500/50 transition-all resize-none"
            placeholder="curl -s https://example.com/health"
            required
          />
        </label>

        <div className="grid md:grid-cols-3 gap-4 items-end">
          <label className="block">
            <span className="text-xs text-gray-500 font-mono uppercase tracking-wide mb-2 block">
              Timeout (ms)
            </span>
            <input
              type="number"
              min={1000}
              max={600000}
              value={form.timeoutMs}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  timeoutMs: Number(e.target.value) || 60_000,
                }))
              }
              className="w-full rounded-lg bg-dark-900/50 px-4 py-2.5 text-sm text-gray-100 outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-300 pb-2.5">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, enabled: e.target.checked }))
              }
              className="w-4 h-4 rounded bg-dark-900/50 border-dark-600 text-amber-500 focus:ring-2 focus:ring-amber-500/50"
            />
            Enabled
          </label>

          <div className="flex gap-2 md:justify-end">
            {isEditing && (
              <button
                type="button"
                onClick={onReset}
                className="px-4 py-2.5 rounded-lg bg-dark-700/60 hover:bg-dark-600/60 text-sm text-gray-300 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-sm inline-flex items-center gap-2 disabled:opacity-50 transition-all"
            >
              {isEditing ? <Save size={14} /> : <Plus size={14} />}
              {saving ? "Saving..." : isEditing ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
