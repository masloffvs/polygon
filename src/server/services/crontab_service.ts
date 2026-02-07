import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../utils/logger";

const STORE_PATH = path.join(process.cwd(), "user_files", "crontab.json");
const HISTORY_LIMIT = 200;
const OUTPUT_LIMIT_BYTES = 64 * 1024;
const TICK_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 10 * 60_000;

type CronTriggerType = "schedule" | "manual";
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

interface CronStore {
  version: number;
  tasks: CronTask[];
  history: CronExecutionRecord[];
}

interface CreateTaskInput {
  name: string;
  schedule: string;
  command: string;
  enabled?: boolean;
  timeoutMs?: number;
}

interface UpdateTaskInput {
  id: string;
  name?: string;
  schedule?: string;
  command?: string;
  enabled?: boolean;
  timeoutMs?: number;
}

interface CompiledCron {
  normalized: string;
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  domAny: boolean;
  dowAny: boolean;
}

interface ParsedField {
  values: Set<number>;
  isAny: boolean;
}

const MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DOW_ALIASES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const CRON_MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const GLOBAL_KEY = Symbol.for("Polygon.CronTabService");

class CronTabService {
  private store: CronStore = {
    version: 1,
    tasks: [],
    history: [],
  };

  private started = false;
  private loaded = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private readonly runningTaskIds = new Set<string>();
  private readonly lastRunKeyByTask = new Map<string, string>();
  private lastTickKey = "";
  private readonly compiledCache = new Map<string, CompiledCron>();

  public static getInstance(): CronTabService {
    const globalRef = globalThis as Record<symbol, unknown>;
    if (!globalRef[GLOBAL_KEY]) {
      globalRef[GLOBAL_KEY] = new CronTabService();
    }
    return globalRef[GLOBAL_KEY] as CronTabService;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    await this.loadFromDisk();

    this.started = true;
    this.tickTimer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);

    void this.tick();
    logger.info("CronTabService started");
  }

  public async ensureStarted(): Promise<void> {
    if (!this.started) {
      await this.start();
    }
  }

  public stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.started = false;
  }

  public getState() {
    return {
      tasks: [...this.store.tasks].sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      ),
      history: [...this.store.history],
      runningTaskIds: Array.from(this.runningTaskIds),
      serverTime: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
  }

  public getHistory(taskId?: string, limit = 50): CronExecutionRecord[] {
    const cappedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    if (!taskId) {
      return this.store.history.slice(0, cappedLimit);
    }
    return this.store.history
      .filter((record) => record.taskId === taskId)
      .slice(0, cappedLimit);
  }

  public async createTask(input: CreateTaskInput): Promise<CronTask> {
    await this.ensureStarted();
    const name = this.requireNonEmpty(input.name, "name");
    const command = this.requireNonEmpty(input.command, "command");
    const schedule = this.normalizeAndValidateSchedule(input.schedule);
    const timeoutMs = this.normalizeTimeout(input.timeoutMs);

    const now = new Date().toISOString();
    const task: CronTask = {
      id: crypto.randomUUID(),
      name,
      schedule,
      command,
      enabled: input.enabled !== false,
      timeoutMs,
      createdAt: now,
      updatedAt: now,
      lastStatus: "idle",
    };

    this.store.tasks.push(task);
    this.enqueueSave();

    logger.info(
      { taskId: task.id, name: task.name, schedule: task.schedule },
      "Cron task created",
    );
    return task;
  }

  public async updateTask(input: UpdateTaskInput): Promise<CronTask> {
    await this.ensureStarted();
    const task = this.findTask(input.id);

    if (input.name !== undefined) {
      task.name = this.requireNonEmpty(input.name, "name");
    }

    if (input.command !== undefined) {
      task.command = this.requireNonEmpty(input.command, "command");
    }

    if (input.schedule !== undefined) {
      task.schedule = this.normalizeAndValidateSchedule(input.schedule);
    }

    if (input.enabled !== undefined) {
      task.enabled = Boolean(input.enabled);
    }

    if (input.timeoutMs !== undefined) {
      task.timeoutMs = this.normalizeTimeout(input.timeoutMs);
    }

    task.updatedAt = new Date().toISOString();
    this.enqueueSave();

    logger.info({ taskId: task.id, name: task.name }, "Cron task updated");
    return task;
  }

  public async deleteTask(taskId: string): Promise<void> {
    await this.ensureStarted();
    const idx = this.store.tasks.findIndex((task) => task.id === taskId);
    if (idx < 0) {
      throw new Error("Task not found");
    }

    const [removed] = this.store.tasks.splice(idx, 1);
    this.lastRunKeyByTask.delete(taskId);
    this.store.history = this.store.history.filter((entry) => entry.taskId !== taskId);
    this.enqueueSave();

    logger.info(
      { taskId, name: removed?.name ?? "unknown" },
      "Cron task deleted",
    );
  }

  public async runTaskNow(taskId: string): Promise<CronExecutionRecord> {
    await this.ensureStarted();
    return this.runTask(taskId, "manual");
  }

  private async tick(): Promise<void> {
    if (!this.started) return;

    const now = new Date();
    const tickKey = this.getMinuteKey(now);
    if (tickKey === this.lastTickKey) return;
    this.lastTickKey = tickKey;

    for (const task of this.store.tasks) {
      if (!task.enabled) continue;

      try {
        if (!this.matchesSchedule(task.schedule, now)) continue;

        const lastRunKey = this.lastRunKeyByTask.get(task.id);
        if (lastRunKey === tickKey) continue;
        this.lastRunKeyByTask.set(task.id, tickKey);

        if (this.runningTaskIds.has(task.id)) {
          logger.warn(
            { taskId: task.id, name: task.name },
            "Cron task is already running, skipping scheduled launch",
          );
          continue;
        }

        void this.runTask(task.id, "schedule");
      } catch (err) {
        logger.error(
          { err, taskId: task.id, schedule: task.schedule },
          "Failed to evaluate cron schedule",
        );
      }
    }
  }

  private async runTask(
    taskId: string,
    trigger: CronTriggerType,
  ): Promise<CronExecutionRecord> {
    const task = this.findTask(taskId);
    if (this.runningTaskIds.has(taskId)) {
      throw new Error("Task is already running");
    }

    this.runningTaskIds.add(taskId);
    task.lastStatus = "running";
    task.updatedAt = new Date().toISOString();
    this.enqueueSave();

    const startedAt = new Date();
    const startedIso = startedAt.toISOString();
    let execution: CronExecutionRecord;

    try {
      const result = await this.executeCommand(task);
      const finishedAt = new Date();
      const status: Exclude<CronTaskStatus, "idle" | "running"> = result.timedOut
        ? "timeout"
        : result.exitCode === 0
          ? "success"
          : "error";

      execution = {
        id: crypto.randomUUID(),
        taskId: task.id,
        taskName: task.name,
        trigger,
        status,
        startedAt: startedIso,
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (err) {
      const finishedAt = new Date();
      execution = {
        id: crypto.randomUUID(),
        taskId: task.id,
        taskName: task.name,
        trigger,
        status: "error",
        startedAt: startedIso,
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        exitCode: null,
        timedOut: false,
        stdout: "",
        stderr: "",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.runningTaskIds.delete(taskId);
    }

    this.applyExecutionToTask(task, execution);
    this.store.history.unshift(execution);
    if (this.store.history.length > HISTORY_LIMIT) {
      this.store.history = this.store.history.slice(0, HISTORY_LIMIT);
    }
    this.enqueueSave();

    if (execution.status === "success") {
      logger.info(
        {
          taskId: task.id,
          name: task.name,
          trigger,
          durationMs: execution.durationMs,
          exitCode: execution.exitCode,
        },
        "Cron task finished",
      );
    } else {
      logger.warn(
        {
          taskId: task.id,
          name: task.name,
          trigger,
          status: execution.status,
          durationMs: execution.durationMs,
          exitCode: execution.exitCode,
          error: execution.error,
        },
        "Cron task finished with issues",
      );
    }

    return execution;
  }

  private applyExecutionToTask(task: CronTask, execution: CronExecutionRecord) {
    task.lastRunAt = execution.startedAt;
    task.lastStatus = execution.status;
    task.lastDurationMs = execution.durationMs;
    task.lastExitCode = execution.exitCode;
    task.updatedAt = execution.finishedAt;

    if (execution.status === "success") {
      delete task.lastError;
      return;
    }

    const combinedError = [
      execution.error,
      execution.stderr.trim(),
      execution.timedOut ? "Execution timeout reached" : undefined,
      execution.exitCode !== null ? `Exit code: ${execution.exitCode}` : undefined,
    ]
      .filter(Boolean)
      .join(" | ");

    task.lastError = combinedError || "Command failed";
  }

  private async executeCommand(task: CronTask): Promise<{
    exitCode: number | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
  }> {
    const child = Bun.spawn(["bash", "-lc", task.command], {
      cwd: process.cwd(),
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // noop
      }

      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // noop
        }
      }, 2_000);
    }, task.timeoutMs);

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        this.readStreamWithLimit(child.stdout),
        this.readStreamWithLimit(child.stderr),
        child.exited,
      ]);

      return {
        exitCode: Number.isFinite(exitCode) ? exitCode : null,
        timedOut,
        stdout,
        stderr,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readStreamWithLimit(
    stream: ReadableStream<Uint8Array> | null,
  ): Promise<string> {
    if (!stream) return "";

    const reader = stream.getReader();
    const decoder = new TextDecoder();

    let output = "";
    let usedBytes = 0;
    let truncated = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        if (usedBytes >= OUTPUT_LIMIT_BYTES) {
          truncated = true;
          await reader.cancel();
          break;
        }

        const remaining = OUTPUT_LIMIT_BYTES - usedBytes;
        if (value.byteLength <= remaining) {
          output += decoder.decode(value, { stream: true });
          usedBytes += value.byteLength;
        } else {
          output += decoder.decode(value.slice(0, remaining), { stream: true });
          usedBytes += remaining;
          truncated = true;
          await reader.cancel();
          break;
        }
      }
    } finally {
      output += decoder.decode();
      reader.releaseLock();
    }

    if (truncated) {
      output += "\n...[output truncated]";
    }

    return output;
  }

  private findTask(taskId: string): CronTask {
    const task = this.store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    return task;
  }

  private normalizeTimeout(rawTimeout?: number): number {
    if (rawTimeout === undefined || rawTimeout === null) {
      return DEFAULT_TIMEOUT_MS;
    }
    const timeout = Math.trunc(Number(rawTimeout));
    if (!Number.isFinite(timeout)) {
      throw new Error("timeoutMs must be a number");
    }
    if (timeout < MIN_TIMEOUT_MS || timeout > MAX_TIMEOUT_MS) {
      throw new Error(
        `timeoutMs must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`,
      );
    }
    return timeout;
  }

  private requireNonEmpty(value: string, field: string): string {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      throw new Error(`Missing required field: ${field}`);
    }
    return normalized;
  }

  private normalizeAndValidateSchedule(schedule: string): string {
    const normalized = this.normalizeSchedule(schedule);
    this.compileSchedule(normalized);
    return normalized;
  }

  private normalizeSchedule(expression: string): string {
    const value = String(expression ?? "").trim().toLowerCase();
    if (!value) {
      throw new Error("Missing required field: schedule");
    }

    const macro = CRON_MACROS[value];
    if (macro) return macro;

    return value.split(/\s+/).join(" ");
  }

  private matchesSchedule(schedule: string, date: Date): boolean {
    const compiled = this.compileSchedule(schedule);

    const minuteMatch = compiled.minute.has(date.getMinutes());
    const hourMatch = compiled.hour.has(date.getHours());
    const monthMatch = compiled.month.has(date.getMonth() + 1);
    const domMatch = compiled.dayOfMonth.has(date.getDate());
    const dowMatch = compiled.dayOfWeek.has(date.getDay());

    let dayMatch = false;
    if (compiled.domAny && compiled.dowAny) {
      dayMatch = true;
    } else if (compiled.domAny) {
      dayMatch = dowMatch;
    } else if (compiled.dowAny) {
      dayMatch = domMatch;
    } else {
      dayMatch = domMatch || dowMatch;
    }

    return minuteMatch && hourMatch && monthMatch && dayMatch;
  }

  private compileSchedule(schedule: string): CompiledCron {
    const cached = this.compiledCache.get(schedule);
    if (cached) return cached;

    const chunks = schedule.split(/\s+/);
    if (chunks.length !== 5) {
      throw new Error(
        "Invalid cron expression. Expected 5 fields: minute hour day month dayOfWeek",
      );
    }

    const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = chunks;
    if (
      minuteRaw === undefined ||
      hourRaw === undefined ||
      domRaw === undefined ||
      monthRaw === undefined ||
      dowRaw === undefined
    ) {
      throw new Error("Invalid cron expression");
    }

    const minute = this.parseField(minuteRaw, 0, 59);
    const hour = this.parseField(hourRaw, 0, 23);
    const dayOfMonth = this.parseField(domRaw, 1, 31);
    const month = this.parseField(monthRaw, 1, 12, MONTH_ALIASES);
    const dayOfWeek = this.parseField(dowRaw, 0, 6, DOW_ALIASES, {
      allowSevenAsSunday: true,
    });

    const compiled: CompiledCron = {
      normalized: schedule,
      minute: minute.values,
      hour: hour.values,
      dayOfMonth: dayOfMonth.values,
      month: month.values,
      dayOfWeek: dayOfWeek.values,
      domAny: dayOfMonth.isAny,
      dowAny: dayOfWeek.isAny,
    };

    this.compiledCache.set(schedule, compiled);
    return compiled;
  }

  private parseField(
    rawValue: string,
    min: number,
    max: number,
    aliases?: Record<string, number>,
    options?: { allowSevenAsSunday?: boolean },
  ): ParsedField {
    const value = rawValue.trim().toLowerCase();
    if (!value) {
      throw new Error("Invalid cron field: empty");
    }

    const values = new Set<number>();
    const numericMax = options?.allowSevenAsSunday ? max + 1 : max;
    const segments = value.split(",");

    for (const segmentRaw of segments) {
      const segment = this.replaceAliases(segmentRaw.trim(), aliases);
      if (!segment) {
        throw new Error(`Invalid cron segment: "${segmentRaw}"`);
      }

      const [basePart, stepPart, ...extraParts] = segment.split("/");
      const base = basePart ?? "";
      if (extraParts.length > 0) {
        throw new Error(`Invalid step syntax in cron segment: "${segmentRaw}"`);
      }

      const step = stepPart ? Number(stepPart) : 1;
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Invalid step value in cron segment: "${segmentRaw}"`);
      }

      let rangeStart: number;
      let rangeEnd: number;

      if (base === "*" || base === "") {
        rangeStart = min;
        rangeEnd = max;
      } else if (base.includes("-")) {
        const [leftRaw, rightRaw, ...invalidRange] = base.split("-");
        if (
          invalidRange.length > 0 ||
          leftRaw === undefined ||
          rightRaw === undefined
        ) {
          throw new Error(`Invalid range in cron segment: "${segmentRaw}"`);
        }

        rangeStart = this.parseNumericField(leftRaw, min, numericMax, segmentRaw);
        rangeEnd = this.parseNumericField(
          rightRaw,
          min,
          numericMax,
          segmentRaw,
        );
        if (rangeStart > rangeEnd) {
          throw new Error(`Invalid range order in cron segment: "${segmentRaw}"`);
        }
      } else {
        rangeStart = this.parseNumericField(base, min, numericMax, segmentRaw);
        rangeEnd = stepPart ? max : rangeStart;
      }

      for (let current = rangeStart; current <= rangeEnd; current += step) {
        let normalized = current;
        if (options?.allowSevenAsSunday && normalized === 7) {
          normalized = 0;
        }
        if (normalized < min || normalized > max) {
          continue;
        }
        values.add(normalized);
      }
    }

    if (values.size === 0) {
      throw new Error(`Invalid cron field "${rawValue}"`);
    }

    const expectedSize = max - min + 1;
    const isAny = values.size === expectedSize;
    return { values, isAny };
  }

  private replaceAliases(
    source: string,
    aliases?: Record<string, number>,
  ): string {
    if (!aliases) return source;
    return source.replace(/[a-z]{3}/g, (chunk) => {
      const mapped = aliases[chunk];
      if (mapped === undefined) {
        throw new Error(`Unknown cron alias "${chunk}"`);
      }
      return String(mapped);
    });
  }

  private parseNumericField(
    raw: string,
    min: number,
    max: number,
    originalSegment: string,
  ): number {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
      throw new Error(`Invalid number in cron segment: "${originalSegment}"`);
    }
    if (parsed < min || parsed > max) {
      throw new Error(`Value out of range in cron segment: "${originalSegment}"`);
    }
    return parsed;
  }

  private getMinuteKey(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
    ].join("-");
  }

  private async loadFromDisk(): Promise<void> {
    if (this.loaded) return;

    try {
      const raw = await fs.readFile(STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<CronStore>;

      this.store = {
        version: 1,
        tasks: Array.isArray(parsed.tasks)
          ? parsed.tasks.map((task) => this.normalizeTask(task))
          : [],
        history: Array.isArray(parsed.history)
          ? parsed.history.slice(0, HISTORY_LIMIT)
          : [],
      };
      logger.info({ path: STORE_PATH }, "CronTab store loaded");
    } catch (err) {
      await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
      await fs.writeFile(
        STORE_PATH,
        JSON.stringify(this.store, null, 2),
        "utf-8",
      );
      logger.warn({ err, path: STORE_PATH }, "CronTab store initialized");
    } finally {
      this.loaded = true;
    }
  }

  private normalizeTask(task: Partial<CronTask>): CronTask {
    const now = new Date().toISOString();
    const schedule = this.normalizeAndValidateSchedule(String(task.schedule ?? "* * * * *"));
    const timeoutMs = this.normalizeTimeout(
      typeof task.timeoutMs === "number" ? task.timeoutMs : DEFAULT_TIMEOUT_MS,
    );

    return {
      id: String(task.id ?? crypto.randomUUID()),
      name: this.requireNonEmpty(String(task.name ?? "Unnamed task"), "name"),
      schedule,
      command: this.requireNonEmpty(String(task.command ?? "echo missing-command"), "command"),
      enabled: Boolean(task.enabled ?? false),
      timeoutMs,
      createdAt: typeof task.createdAt === "string" ? task.createdAt : now,
      updatedAt: typeof task.updatedAt === "string" ? task.updatedAt : now,
      lastRunAt: task.lastRunAt,
      lastStatus: task.lastStatus,
      lastDurationMs: task.lastDurationMs,
      lastExitCode: task.lastExitCode,
      lastError: task.lastError,
    };
  }

  private enqueueSave() {
    this.saveQueue = this.saveQueue
      .then(() =>
        fs.writeFile(STORE_PATH, JSON.stringify(this.store, null, 2), "utf-8"),
      )
      .catch((err) => {
        logger.error({ err, path: STORE_PATH }, "Failed to persist CronTab store");
      });
  }
}

export const cronTabService = CronTabService.getInstance();
