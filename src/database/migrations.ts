// Database schema for DayPin.
// Migrations are cumulative and safe to re-run (all use IF NOT EXISTS).
// SQLite's execute() only accepts ONE statement per call.

const MIGRATIONS: string[] = [
  // ---- Phase 1 ----
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    note TEXT,
    task_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(task_date)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(sort_order)`,

  // ---- Phase 2 ----
  `CREATE TABLE IF NOT EXISTS task_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT,
    old_date TEXT,
    new_date TEXT,
    title_snapshot TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_history_task_id ON task_history(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_history_created ON task_history(created_at)`,

  // ---- Phase 3 ----
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // ---- Status model v2: retire "todo" — tasks are only doing/done ----
  `UPDATE tasks SET status = 'doing' WHERE status = 'todo'`,
];

/** Run all schema migrations. Safe to call on every startup (IF NOT EXISTS). */
export async function runMigrations(
  execute: (sql: string) => Promise<unknown>
): Promise<void> {
  for (const sql of MIGRATIONS) {
    await execute(sql);
  }
}
