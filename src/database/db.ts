// Data access layer. Wraps the Tauri SQL plugin so the UI never touches SQL
// directly. All functions assume the database has been initialized via initDb().

import Database from "@tauri-apps/plugin-sql";
import { runMigrations } from "./migrations";
import type { NewTaskInput, Task, TaskPatch, TaskStatus } from "../types";

const DB_URI = "sqlite:daypin.db";

let db: Database | null = null;

/** Open the database and run schema migrations. Safe to call on every startup. */
export async function initDb(): Promise<void> {
  if (db) return;
  db = await Database.load(DB_URI);
  await runMigrations((sql) => db!.execute(sql));
}

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

function now(): string {
  return new Date().toISOString();
}

export async function listTasksByDate(dateKey: string): Promise<Task[]> {
  return getDb().select<Task[]>(
    "SELECT * FROM tasks WHERE task_date = ? ORDER BY sort_order ASC, id ASC",
    [dateKey]
  );
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const status: TaskStatus = input.status ?? "doing";
  const priority = input.priority ?? 0;
  // Append after the current max sort_order for this date.
  const maxRows = await getDb().select<{ max: number | null }[]>(
    "SELECT MAX(sort_order) AS max FROM tasks WHERE task_date = ?",
    [input.task_date]
  );
  const sortOrder = (maxRows[0]?.max ?? -1) + 1;
  const ts = now();
  const result = await getDb().execute(
    "INSERT INTO tasks (title, note, task_date, status, priority, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      input.title,
      input.note ?? null,
      input.task_date,
      status,
      priority,
      sortOrder,
      ts,
      ts,
    ]
  );
  const created = await getDb().select<Task[]>("SELECT * FROM tasks WHERE id = ?", [
    result.lastInsertId,
  ]);
  return created[0];
}

export async function updateTask(id: number, patch: TaskPatch): Promise<Task> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.title !== undefined) {
    fields.push("title = ?");
    values.push(patch.title);
  }
  if (patch.note !== undefined) {
    fields.push("note = ?");
    values.push(patch.note);
  }
  if (patch.task_date !== undefined) {
    fields.push("task_date = ?");
    values.push(patch.task_date);
  }
  if (patch.status !== undefined) {
    fields.push("status = ?");
    values.push(patch.status);
  }
  if (patch.priority !== undefined) {
    fields.push("priority = ?");
    values.push(patch.priority);
  }
  if (patch.sort_order !== undefined) {
    fields.push("sort_order = ?");
    values.push(patch.sort_order);
  }
  if (patch.completed_at !== undefined) {
    fields.push("completed_at = ?");
    values.push(patch.completed_at);
  }
  if (fields.length === 0) {
    const rows = await getDb().select<Task[]>("SELECT * FROM tasks WHERE id = ?", [id]);
    return rows[0];
  }
  fields.push("updated_at = ?");
  values.push(now());
  values.push(id);
  await getDb().execute(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`, values);
  const rows = await getDb().select<Task[]>("SELECT * FROM tasks WHERE id = ?", [id]);
  return rows[0];
}

export async function setStatus(id: number, status: TaskStatus): Promise<Task> {
  const completed_at = status === "done" ? now() : null;
  return updateTask(id, { status, completed_at });
}

export async function deleteTask(id: number): Promise<void> {
  await getDb().execute("DELETE FROM tasks WHERE id = ?", [id]);
}

// ---- Phase 2 helpers ----

/** History record action types. */
export type HistoryAction =
  | "create"
  | "status_change"
  | "date_change"
  | "carry_over"
  | "delete";

export interface HistoryRecord {
  id: number;
  task_id: number;
  action: HistoryAction;
  old_status: string | null;
  new_status: string | null;
  old_date: string | null;
  new_date: string | null;
  title_snapshot: string | null;
  created_at: string;
}

/** Append a history entry. Does not throw if the table is missing. */
export async function recordHistory(
  taskId: number,
  action: HistoryAction,
  snapshot: {
    old_status?: TaskStatus | null;
    new_status?: TaskStatus | null;
    old_date?: string | null;
    new_date?: string | null;
    title?: string | null;
  }
): Promise<void> {
  await getDb().execute(
    `INSERT INTO task_history
      (task_id, action, old_status, new_status, old_date, new_date, title_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      taskId,
      action,
      snapshot.old_status ?? null,
      snapshot.new_status ?? null,
      snapshot.old_date ?? null,
      snapshot.new_date ?? null,
      snapshot.title ?? null,
      now(),
    ]
  );
}

/** Fetch yesterday's open (not done) tasks — used for carry-over prompt. */
export async function listOpenTasksByDate(dateKey: string): Promise<Task[]> {
  return getDb().select<Task[]>(
    `SELECT * FROM tasks
      WHERE task_date = ? AND status != 'done'
      ORDER BY sort_order ASC, id ASC`,
    [dateKey]
  );
}

/** Fetch ALL open (not done) tasks before the given date — startup reminder. */
export async function listOpenTasksBefore(dateKey: string): Promise<Task[]> {
  return getDb().select<Task[]>(
    `SELECT * FROM tasks
      WHERE task_date < ? AND status != 'done'
      ORDER BY task_date ASC, sort_order ASC, id ASC`,
    [dateKey]
  );
}

/** Fetch tasks for a month (all dates in [start, end]). */
export async function listTasksByDateRange(
  start: string,
  end: string
): Promise<Task[]> {
  return getDb().select<Task[]>(
    "SELECT * FROM tasks WHERE task_date BETWEEN ? AND ? ORDER BY task_date ASC, sort_order ASC",
    [start, end]
  );
}

/** Fetch a distinct, sorted list of dates that have at least one task. */
export async function listDatesWithTasks(): Promise<string[]> {
  const rows = await getDb().select<{ task_date: string }[]>(
    "SELECT DISTINCT task_date FROM tasks ORDER BY task_date DESC"
  );
  return rows.map((r) => r.task_date);
}

/** Update all sort_orders for a date at once (used after drag-reorder). */
export async function updateSortOrders(
  _dateKey: string,
  orderedIds: number[]
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await getDb().execute(
      "UPDATE tasks SET sort_order = ? WHERE id = ?",
      [i, orderedIds[i]]
    );
  }
}

/** Detect whether task was already carried over from another date (avoid duplicates). */
export async function wasCarriedOver(taskId: number, fromDate: string): Promise<boolean> {
  const rows = await getDb().select<HistoryRecord[]>(
    `SELECT * FROM task_history
      WHERE task_id = ? AND action = 'carry_over' AND old_date = ?
      LIMIT 1`,
    [taskId, fromDate]
  );
  return rows.length > 0;
}
