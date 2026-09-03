// Task state (Zustand). Holds the currently-viewed date and its tasks, and
// exposes actions that the UI calls. All actions keep the DB and the in-memory
// list in sync.

import { create } from "zustand";
import * as db from "../database/db";
import type { Task, TaskPatch, TaskStatus } from "../types";
import { addDays, todayKey } from "../utils/date";

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  doing: "done",
  done: "doing",
};

interface TaskState {
  tasks: Task[];
  currentDate: string; // YYYY-MM-DD
  loading: boolean;
  initialized: boolean;
  error: string | null;
  lastDeleted: Task | null;
  openPast: Task[] | null; // lazily loaded: ALL unfinished tasks before today

  init: () => Promise<void>;
  reload: () => Promise<void>;
  goToToday: () => Promise<void>;
  prevDay: () => Promise<void>;
  nextDay: () => Promise<void>;
  setDate: (key: string) => Promise<void>;
  addTask: (title: string) => Promise<void>;
  toggleStatus: (id: number) => Promise<void>;
  setStatus: (id: number, status: TaskStatus) => Promise<void>;
  editTitle: (id: number, title: string) => Promise<void>;
  editTask: (id: number, patch: TaskPatch) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  undoDelete: () => Promise<void>;
  clearUndo: () => void;
  clearError: () => void;
  // Phase 2
  checkPastOpen: () => Promise<void>;
  carryOverPast: () => Promise<void>;
  clearPastOpen: () => void;
  reorderTasks: (orderedIds: number[]) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  currentDate: todayKey(),
  loading: false,
  initialized: false,
  error: null,
  lastDeleted: null,
  openPast: null,

  init: async () => {
    if (get().initialized) return;
    try {
      await db.initDb();
      set({ initialized: true });
      await get().reload();
      await get().checkPastOpen();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[init] failed:", msg);
      set({ loading: false, error: `数据库初始化失败：${msg}` });
    }
  },

  reload: async () => {
    set({ loading: true, error: null });
    try {
      const tasks = await db.listTasksByDate(get().currentDate);
      set({ tasks, loading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[reload] failed:", msg);
      set({ loading: false, error: `加载任务失败：${msg}` });
    }
  },

  goToToday: async () => {
    set({ currentDate: todayKey(), openPast: null });
    await get().reload();
    await get().checkPastOpen();
  },

  prevDay: async () => {
    set({ currentDate: addDays(get().currentDate, -1), openPast: null });
    await get().reload();
  },

  nextDay: async () => {
    set({ currentDate: addDays(get().currentDate, 1), openPast: null });
    await get().reload();
  },

  setDate: async (key) => {
    set({ currentDate: key, openPast: null });
    await get().reload();
  },

  addTask: async (title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const task = await db.createTask({ title: trimmed, task_date: get().currentDate });
    // Record history for creation
    try {
      await db.recordHistory(task.id, "create", {
        new_status: task.status,
        new_date: task.task_date,
        title: task.title,
      });
    } catch {
      // Phase 2 history table may not exist yet during Phase 1-only runs — ignore.
    }
    set({ tasks: [...get().tasks, task] });
  },

  toggleStatus: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    await get().setStatus(id, NEXT_STATUS[task.status]);
  },

  setStatus: async (id, status) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const updated = await db.setStatus(id, status);
    // Record status change history
    try {
      if (task.status !== status) {
        await db.recordHistory(id, "status_change", {
          old_status: task.status,
          new_status: status,
          title: updated.title,
        });
      }
    } catch { /* ignore */ }
    set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) });
  },

  editTitle: async (id, title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const updated = await db.updateTask(id, { title: trimmed });
    set({ tasks: get().tasks.map((t) => (t.id === id ? updated : t)) });
  },

  editTask: async (id, patch) => {
    if (patch.title !== undefined) {
      const trimmed = patch.title.trim();
      if (!trimmed) return;
      patch = { ...patch, title: trimmed };
    }
    const task = get().tasks.find((t) => t.id === id);
    const updated = await db.updateTask(id, patch);

    // Record date-change history
    if (task && patch.task_date !== undefined && patch.task_date !== task.task_date) {
      try {
        await db.recordHistory(id, "date_change", {
          old_date: task.task_date,
          new_date: patch.task_date,
          title: updated.title,
        });
      } catch { /* ignore */ }
    }
    // Record status-change history if status also changed via edit
    if (task && patch.status !== undefined && patch.status !== task.status) {
      try {
        await db.recordHistory(id, "status_change", {
          old_status: task.status,
          new_status: patch.status,
          title: updated.title,
        });
      } catch { /* ignore */ }
    }

    const current = get().currentDate;
    set({
      tasks: updated.task_date === current
        ? get().tasks.map((t) => (t.id === id ? updated : t))
        : get().tasks.filter((t) => t.id !== id),
    });
  },

  deleteTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    await db.deleteTask(id);
    // Record deletion history
    try {
      await db.recordHistory(id, "delete", {
        old_status: task.status,
        old_date: task.task_date,
        title: task.title,
      });
    } catch { /* ignore */ }
    set({
      tasks: get().tasks.filter((t) => t.id !== id),
      lastDeleted: task,
    });
  },

  undoDelete: async () => {
    const t = get().lastDeleted;
    if (!t) return;
    const recreated = await db.createTask({
      title: t.title,
      task_date: t.task_date,
      note: t.note,
      status: t.status,
      priority: t.priority,
    });
    set({ tasks: [...get().tasks, recreated], lastDeleted: null });
  },

  clearUndo: () => set({ lastDeleted: null }),
  clearError: () => set({ error: null }),

  // ---- Phase 2 actions ----

  /** Detect ALL unfinished tasks dated before today (not just yesterday). */
  checkPastOpen: async () => {
    const today = todayKey();
    // Only check when we ARE on today
    if (get().currentDate !== today) {
      set({ openPast: null });
      return;
    }
    try {
      const openTasks = await db.listOpenTasksBefore(today);
      set({ openPast: openTasks.length > 0 ? openTasks : null });
    } catch {
      set({ openPast: null });
    }
  },

  /**
   * Move ALL past open tasks to today, recording carry_over with each task's
   * own source date. Double-run is guarded: checkPastOpen clears the list once
   * processed, and we skip rows already dated today.
   */
  carryOverPast: async () => {
    const open = get().openPast;
    if (!open || open.length === 0) return;
    const today = todayKey();

    const updatedTasks: Task[] = [];
    for (const t of open) {
      // Guard: skip if already moved (race condition or double-click).
      if (t.task_date === today) continue;
      const moved = await db.updateTask(t.id, { task_date: today });
      try {
        await db.recordHistory(t.id, "carry_over", {
          old_date: t.task_date,
          new_date: today,
          old_status: t.status,
          new_status: t.status,
          title: t.title,
        });
      } catch { /* ignore */ }
      updatedTasks.push(moved);
    }

    const current = get().currentDate;
    set({
      openPast: null,
      tasks: current === today
        ? [...get().tasks, ...updatedTasks]
        : get().tasks,
    });
  },

  clearPastOpen: () => set({ openPast: null }),

  /** Persist drag-reorder for the current date. */
  reorderTasks: async (orderedIds) => {
    const current = get().currentDate;
    set({
      tasks: orderedIds.map((id, idx) => {
        const t = get().tasks.find((x) => x.id === id);
        return t ? { ...t, sort_order: idx } : null;
      }).filter(Boolean) as Task[],
    });
    try {
      await db.updateSortOrders(current, orderedIds);
    } catch {
      // On failure, reload from DB to restore the old order.
      await get().reload();
    }
  },
}));
