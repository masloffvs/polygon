import { Pencil, Play, Trash2 } from "lucide-react";
import type { FormState } from "./TaskEditor";

type CronTaskStatus = "idle" | "running" | "success" | "error" | "timeout";

export interface CronTask {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastStatus?: CronTaskStatus;
  lastDurationMs?: number;
  lastExitCode?: number | null;
  lastError?: string;
}

interface TaskListProps {
  tasks: CronTask[];
  runningTaskIds: string[];
  onRun: (taskId: string) => Promise<void>;
  onToggle: (task: CronTask) => Promise<void>;
  onEdit: (task: CronTask) => void;
  onDelete: (task: CronTask) => Promise<void>;
}

const statusTone: Record<CronTaskStatus, string> = {
  idle: "bg-gray-700/40 text-gray-400",
  running: "bg-blue-500/20 text-blue-400 animate-pulse",
  success: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
  timeout: "bg-orange-500/20 text-orange-400",
};

function formatTimestamp(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatDuration(duration?: number): string {
  if (duration === undefined || duration === null) return "—";
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(2)}s`;
}

export function TaskList({
  tasks,
  runningTaskIds,
  onRun,
  onToggle,
  onEdit,
  onDelete,
}: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="bg-dark-800/40 backdrop-blur-sm rounded-xl p-12 text-center">
        <div className="text-gray-600 text-sm">No tasks yet</div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800/40 backdrop-blur-sm rounded-xl p-6">
      <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4">
        Tasks
      </h2>

      <div className="space-y-3">
        {tasks.map((task) => {
          const running = runningTaskIds.includes(task.id);
          const status = running ? "running" : task.lastStatus || "idle";

          return (
            <div
              key={task.id}
              className="bg-dark-900/50 rounded-lg p-4 hover:bg-dark-900/70 transition-all"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-medium text-gray-100">{task.name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-mono ${statusTone[status]}`}
                    >
                      {status}
                    </span>
                    {!task.enabled && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700/40 text-gray-500 uppercase tracking-wide font-mono">
                        disabled
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mb-1">
                    {task.schedule}
                  </div>
                  <div className="text-xs text-gray-600 font-mono break-all">
                    {task.command}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onRun(task.id)}
                    disabled={running}
                    className="px-3 py-1.5 rounded-lg text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 inline-flex items-center gap-1.5 disabled:opacity-50 transition-all"
                  >
                    <Play size={12} />
                    Run
                  </button>
                  <button
                    type="button"
                    onClick={() => void onToggle(task)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-dark-700/60 hover:bg-dark-600/60 text-gray-400 transition-all"
                  >
                    {task.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-dark-700/60 hover:bg-dark-600/60 text-gray-400 inline-flex items-center gap-1.5 transition-all"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(task)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 inline-flex items-center gap-1.5 transition-all"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-3 text-xs text-gray-600 font-mono">
                <div>
                  <span className="text-gray-700">Last:</span> {formatTimestamp(task.lastRunAt)}
                </div>
                <div>
                  <span className="text-gray-700">Duration:</span> {formatDuration(task.lastDurationMs)}
                </div>
                <div>
                  <span className="text-gray-700">Exit:</span>{" "}
                  {task.lastExitCode === undefined ? "—" : task.lastExitCode}
                </div>
                <div className="truncate" title={task.lastError}>
                  <span className="text-gray-700">Error:</span> {task.lastError || "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
