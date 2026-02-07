import { SquareTerminal } from "lucide-react";

type CronTaskStatus = "idle" | "running" | "success" | "error" | "timeout";
type CronTriggerType = "schedule" | "manual";

export interface CronExecutionRecord {
  id: string;
  taskId: string;
  taskName: string;
  trigger: CronTriggerType;
  status: Exclude<CronTaskStatus, "idle" | "running">;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ExecutionHistoryProps {
  history: CronExecutionRecord[];
}

const execStatusTone: Record<
  Exclude<CronTaskStatus, "idle" | "running">,
  string
> = {
  success: "text-green-400",
  error: "text-red-400",
  timeout: "text-orange-400",
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

export function ExecutionHistory({ history }: ExecutionHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="bg-dark-800/40 backdrop-blur-sm rounded-xl p-12 text-center">
        <div className="text-gray-600 text-sm">No executions yet</div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800/40 backdrop-blur-sm rounded-xl p-6">
      <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <SquareTerminal size={14} />
        Recent Runs
      </h2>

      <div className="space-y-3">
        {history.map((entry) => (
          <div
            key={entry.id}
            className="bg-dark-900/50 rounded-lg p-4 hover:bg-dark-900/70 transition-all"
          >
            <div className="flex items-center justify-between gap-2 text-xs mb-2">
              <div className="text-gray-300 font-mono">
                <span className="font-medium">{entry.taskName}</span>{" "}
                <span className="text-gray-600">({entry.trigger})</span>
              </div>
              <div className={`font-medium font-mono ${execStatusTone[entry.status]}`}>
                {entry.status.toUpperCase()}
              </div>
            </div>
            <div className="text-xs text-gray-600 font-mono">
              {formatTimestamp(entry.startedAt)} | {formatDuration(entry.durationMs)} |
              {" "}exit={entry.exitCode ?? "null"}
            </div>

            {(entry.stdout || entry.stderr || entry.error) && (
              <details className="mt-3">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400 transition-colors font-mono">
                  Output
                </summary>
                <div className="mt-2 space-y-2">
                  {entry.error && (
                    <pre className="text-[11px] text-red-300 bg-red-500/10 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-words font-mono">
                      {entry.error}
                    </pre>
                  )}
                  {entry.stdout && (
                    <pre className="text-[11px] text-green-300 bg-green-500/10 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-words font-mono">
                      {entry.stdout}
                    </pre>
                  )}
                  {entry.stderr && (
                    <pre className="text-[11px] text-orange-300 bg-orange-500/10 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-words font-mono">
                      {entry.stderr}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
