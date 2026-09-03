// Settings persistence — simple key/value wrapper over SQLite `settings` table.

import { getDb } from "./db";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const rows = await getDb().select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = ?",
      [key]
    );
    if (rows.length === 0) return fallback;
    const raw = rows[0].value;
    // Try JSON parse first (for booleans / numbers / arrays), fall back to raw string.
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString();
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  await getDb().execute(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, serialized, now]
  );
}
