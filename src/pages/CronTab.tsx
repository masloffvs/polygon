import {
  Clock3,
  RefreshCw,
} from "lucide-react";
import { type FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { CronTask } from "./CronTab/TaskList";
import type { CronExecutionRecord } from "./CronTab/ExecutionHistory";
import type { FormState } from "./CronTab/TaskEditor";
import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

interface CronStateResponse {
  success: boolean;
  tasks: CronTask[];
  history: CronExecutionRecord[];
  runningTaskIds: string[];
  serverTime: string;
  timezone: string;
  error?: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  schedule: "*/5 * * * *",
  command: "curl -s https://api.ipify.org",
  enabled: true,
  timeoutMs: 60_000,
};

async function requestJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  } & Record<string, unknown>;

  if (!res.ok || json.success === false) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json as T;
}

// Lazy-loaded components
const TaskEditor = lazy(() => import("./CronTab/TaskEditor").then(m => ({ default: m.TaskEditor })));
const TaskList = lazy(() => import("./CronTab/TaskList").then(m => ({ default: m.TaskList })));
const ExecutionHistory = lazy(() => import("./CronTab/ExecutionHistory").then(m => ({ default: m.ExecutionHistory })));

// Loading skeleton
const Skeleton = () => (
  <div className="animate-pulse space-y-3">
    <div className="h-32 bg-dark-700/40 rounded-lg" />
    <div className="h-24 bg-dark-700/40 rounded-lg" />
  </div>
);

function CronTabComponent() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [history, setHistory] = useState<CronExecutionRecord[]>([]);
  const [runningTaskIds, setRunningTaskIds] = useState<string[]>([]);
  const [serverTime, setServerTime] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const isEditing = Boolean(form.id);

  const fetchState = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await requestJson<CronStateResponse>("/api/crontab/state");
      setTasks(data.tasks);
      setHistory(data.history.slice(0, 20));
      setRunningTaskIds(data.runningTaskIds);
      setServerTime(data.serverTime);
      setTimezone(data.timezone);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
    const interval = setInterval(() => {
      void fetchState(true);
    }, 10_000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const resetForm = () => setForm(DEFAULT_FORM);

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (isEditing) {
        await requestJson("/api/crontab/tasks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        await requestJson("/api/crontab/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }

      resetForm();
      await fetchState(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const runTaskNow = async (taskId: string) => {
    setError("");
    try {
      await requestJson("/api/crontab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId }),
      });
      await fetchState(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleTask = async (task: CronTask) => {
    setError("");
    try {
      await requestJson("/api/crontab/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, enabled: !task.enabled }),
      });
      await fetchState(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteTask = async (task: CronTask) => {
    const confirmed = window.confirm(`Delete task "${task.name}"?`);
    if (!confirmed) return;

    setError("");
    try {
      await requestJson("/api/crontab/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id }),
      });

      if (form.id === task.id) {
        resetForm();
      }

      await fetchState(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const nowLabel = useMemo(() => {
    if (!serverTime) return "—";
    const date = new Date(serverTime);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  }, [serverTime]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-800 flex items-center justify-center">
        <div className="text-gray-500 font-mono text-sm animate-pulse">
          Loading CronTab...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-800 p-6">
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-3 mb-2">
              <Clock3 size={24} className="text-amber-400" />
              CronTab
            </h1>
            <p className="text-sm text-gray-500 font-mono">
              Bash task scheduler
            </p>
          </div>

          <div className="text-xs font-mono text-gray-600 space-y-1 text-right">
            <div>
              <span className="text-gray-700">Server:</span> {nowLabel}
            </div>
            <div>
              <span className="text-gray-700">Timezone:</span> {timezone}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void fetchState(true)}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg bg-dark-800/60 hover:bg-dark-700/60 text-sm text-gray-300 inline-flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : undefined}
            />
            Refresh
          </button>
          {error && (
            <div className="text-xs text-red-300 bg-red-500/10 rounded-lg px-3 py-2 font-mono">
              {error}
            </div>
          )}
        </div>

        {/* Task Editor */}
        <Suspense fallback={<Skeleton />}>
          <TaskEditor
            form={form}
            setForm={setForm}
            onSubmit={submitForm}
            onReset={resetForm}
            saving={saving}
            isEditing={isEditing}
          />
        </Suspense>

        {/* Task List */}
        <Suspense fallback={<Skeleton />}>
          <TaskList
            tasks={tasks}
            runningTaskIds={runningTaskIds}
            onRun={runTaskNow}
            onToggle={toggleTask}
            onEdit={(task: CronTask) =>
              setForm({
                id: task.id,
                name: task.name,
                schedule: task.schedule,
                command: task.command,
                enabled: task.enabled,
                timeoutMs: task.timeoutMs,
              })
            }
            onDelete={deleteTask}
          />
        </Suspense>

        {/* Execution History */}
        <Suspense fallback={<Skeleton />}>
          <ExecutionHistory history={history} />
        </Suspense>
      </div>
    </div>
  );
}

export const CronTab = withErrorBoundary(CronTabComponent, {
  title: "CronTab",
});

export default CronTab;
