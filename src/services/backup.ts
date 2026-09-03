// Local backup service — export / import DayPin data as a JSON file.
// Everything stays on the local machine; no network is involved.

import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../database/db";
import { todayKey } from "../utils/date";

export const BACKUP_VERSION = 1;
const APP_NAME = "摩登待办";
// Backups exported before the rename carry the old app id.
const LEGACY_APP_NAMES = ["DayPin"];

// ---- shapes -------------------------------------------------------------

export interface BackupTask {
  id: number;
  title: string;
  note: string | null;
  task_date: string;
  status: string;
  priority: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface BackupHistory {
  id: number;
  task_id: number;
  action: string;
  old_status: string | null;
  new_status: string | null;
  old_date: string | null;
  new_date: string | null;
  title_snapshot: string | null;
  created_at: string;
}

export interface BackupSettings {
  theme?: string;
  always_on_top?: boolean;
  autostart?: boolean;
  [key: string]: unknown;
}

export interface BackupFile {
  app: string;
  backupVersion: number;
  exportedAt: string;
  tasks: BackupTask[];
  taskHistory: BackupHistory[];
  settings: BackupSettings;
}

// ---- export -------------------------------------------------------------

/** Collect all DayPin data from SQLite and serialize a backup JSON string. */
export async function buildBackupJson(): Promise<string> {
  const db = getDb();
  const tasks = await db.select<BackupTask[]>("SELECT * FROM tasks ORDER BY id ASC");
  const taskHistory = await db.select<BackupHistory[]>(
    "SELECT * FROM task_history ORDER BY id ASC"
  );
  const settingRows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings"
  );

  const settings: BackupSettings = {};
  for (const row of settingRows) {
    // Re-parse JSON-encoded values so the backup carries real types.
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  const backup: BackupFile = {
    app: APP_NAME,
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tasks,
    taskHistory,
    settings,
  };
  return JSON.stringify(backup, null, 2);
}

export interface ExportResult {
  cancelled: boolean;
  path?: string;
}

/** Open a save dialog and write the backup file. Never throws for cancel. */
export async function exportBackup(): Promise<ExportResult> {
  const fileName = `${APP_NAME}_Backup_${todayKey()}.json`;
  const content = await buildBackupJson();
  const path = await invoke<string | null>("export_backup", { fileName, content });
  return path ? { cancelled: false, path } : { cancelled: true };
}

// ---- import -------------------------------------------------------------

export interface PickedBackup {
  cancelled: boolean;
  fileName?: string;
  content?: string;
}

/** Open a file dialog and read the picked backup file. Never throws for cancel. */
export async function pickBackupFile(): Promise<PickedBackup> {
  const picked = await invoke<{ file_name: string; content: string } | null>(
    "import_backup"
  );
  if (!picked) return { cancelled: true };
  return { cancelled: false, fileName: picked.file_name, content: picked.content };
}

export type ValidationResult =
  | { ok: true; data: BackupFile }
  | { ok: false; reason: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HISTORY_ACTIONS = new Set([
  "create",
  "status_change",
  "date_change",
  "carry_over",
  "delete",
]);
const KNOWN_SETTINGS = new Set(["theme", "always_on_top", "autostart"]);

function isRealDate(dateStr: string): boolean {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let max = daysInMonth[mo - 1];
  if (mo === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) max = 29;
  return d <= max;
}

function isIsoTimestamp(v: unknown): boolean {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

/**
 * Strictly validate a picked backup file. The current database is only
 * touched after this returns ok AND the user confirms the overwrite.
 */
export function validateBackupJson(content: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return { ok: false, reason: "无法识别该备份文件（不是合法的 JSON）" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "无法识别该备份文件" };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.app !== APP_NAME && !LEGACY_APP_NAMES.includes(obj.app as string)) {
    return { ok: false, reason: "无法识别该备份文件（不是摩登待办备份）" };
  }
  if (typeof obj.backupVersion !== "number") {
    return { ok: false, reason: "备份文件已损坏（缺少版本信息）" };
  }
  if (obj.backupVersion !== BACKUP_VERSION) {
    return { ok: false, reason: `备份版本不兼容（v${obj.backupVersion}，当前支持 v${BACKUP_VERSION}）` };
  }
  if (!Array.isArray(obj.tasks)) {
    return { ok: false, reason: "备份文件已损坏（tasks 字段无效）" };
  }
  if (!Array.isArray(obj.taskHistory)) {
    return { ok: false, reason: "备份文件已损坏（taskHistory 字段无效）" };
  }
  if (typeof obj.settings !== "object" || obj.settings === null) {
    return { ok: false, reason: "备份文件已损坏（settings 字段无效）" };
  }

  const tasks: BackupTask[] = [];
  for (const t of obj.tasks) {
    const task = t as Record<string, unknown>;
    if (
      typeof task.id !== "number" ||
      typeof task.title !== "string" ||
      task.title.length === 0 ||
      typeof task.task_date !== "string" ||
      !ISO_DATE.test(task.task_date) ||
      !isRealDate(task.task_date) ||
      (task.status !== "todo" && task.status !== "doing" && task.status !== "done") ||
      typeof task.priority !== "number" ||
      typeof task.sort_order !== "number" ||
      !isIsoTimestamp(task.created_at) ||
      !isIsoTimestamp(task.updated_at)
    ) {
      return { ok: false, reason: "备份文件已损坏（任务数据格式无效）" };
    }
    if (task.completed_at !== null && !isIsoTimestamp(task.completed_at)) {
      return { ok: false, reason: "备份文件已损坏（任务完成时间无效）" };
    }
    tasks.push(task as unknown as BackupTask);
  }

  for (const h of obj.taskHistory) {
    const rec = h as Record<string, unknown>;
    if (
      typeof rec.task_id !== "number" ||
      typeof rec.action !== "string" ||
      !HISTORY_ACTIONS.has(rec.action) ||
      !isIsoTimestamp(rec.created_at)
    ) {
      return { ok: false, reason: "备份文件已损坏（历史记录格式无效）" };
    }
  }

  // Only keep known settings keys with valid types.
  const cleanSettings: BackupSettings = {};
  const settings = obj.settings as Record<string, unknown>;
  if (
    settings.theme !== undefined &&
    (settings.theme === "light" || settings.theme === "dark" || settings.theme === "system")
  ) {
    cleanSettings.theme = settings.theme;
  }
  if (settings.always_on_top === true || settings.always_on_top === false) {
    cleanSettings.always_on_top = settings.always_on_top;
  }
  if (settings.autostart === true || settings.autostart === false) {
    cleanSettings.autostart = settings.autostart;
  }
  for (const key of Object.keys(settings)) {
    if (!KNOWN_SETTINGS.has(key)) {
      return { ok: false, reason: "备份文件已损坏（包含未知设置项）" };
    }
  }

  return {
    ok: true,
    data: {
      app: APP_NAME,
      backupVersion: obj.backupVersion,
      exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : "",
      tasks,
      taskHistory: obj.taskHistory as BackupHistory[],
      settings: cleanSettings,
    },
  };
}

/** Transactionally restore a validated backup, then reload the app. */
export async function restoreBackup(data: BackupFile): Promise<void> {
  await invoke("restore_backup", { payload: JSON.stringify(data) });
  // Full reload so every store re-initializes from the restored database.
  window.location.reload();
}
