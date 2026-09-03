// Shared domain types for DayPin tasks.

export type TaskStatus = "doing" | "done";

export interface Task {
  id: number;
  title: string;
  note: string | null;
  task_date: string; // YYYY-MM-DD (local)
  status: TaskStatus;
  priority: number;
  sort_order: number;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  completed_at: string | null; // ISO 8601
}

// Fields the UI may supply when creating a task. Date + title are required.
export interface NewTaskInput {
  title: string;
  task_date: string;
  note?: string | null;
  status?: TaskStatus;
  priority?: number;
}

// Fields the UI may patch when editing a task.
export interface TaskPatch {
  title?: string;
  note?: string | null;
  task_date?: string;
  status?: TaskStatus;
  priority?: number;
  sort_order?: number;
  completed_at?: string | null;
}
