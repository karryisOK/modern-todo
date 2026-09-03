import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTaskStore } from "../stores/taskStore";
import type { Task, TaskStatus } from "../types";
import { todayKey } from "../utils/date";
import styles from "./TaskItem.module.css";

const MENU_W = 120;
const MENU_H = 76; // two items
const MENU_GAP = 4;

interface Props {
  task: Task;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  doing: "进行中",
  done: "已完成",
};

const STATUS_ICON: Record<TaskStatus, LucideIcon> = {
  doing: CircleDashed,
  done: CheckCircle2,
};

export function TaskItem({ task }: Props) {
  const toggleStatus = useTaskStore((s) => s.toggleStatus);
  const editTask = useTaskStore((s) => s.editTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftNote, setDraftNote] = useState(task.note ?? "");
  const [draftDate, setDraftDate] = useState(task.task_date);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const menuBoxRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Overdue is computed dynamically — never stored. Past undone = red "未完成".
  const isOverdue = task.task_date < todayKey() && task.status !== "done";
  const StatusIcon = isOverdue ? CircleAlert : STATUS_ICON[task.status] ?? CircleDashed;
  const statusTitle = isOverdue ? "未完成" : STATUS_LABEL[task.status] ?? "进行中";

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // Clicks on the menu itself or the ⋮ button are handled by their onClick.
      if (menuBoxRef.current?.contains(t)) return;
      if (moreBtnRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  /** Open the menu as a fixed-position portal, flipping up near the bottom. */
  function toggleMenu() {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const r = moreBtnRef.current?.getBoundingClientRect();
    if (!r) return;
    let top = r.bottom + MENU_GAP;
    if (top + MENU_H > window.innerHeight - 8) {
      top = r.top - MENU_H - MENU_GAP; // flip upward
    }
    const left = Math.max(8, r.right - MENU_W);
    setMenuPos({ top, left });
    setMenuOpen(true);
  }

  function startEdit() {
    setDraftTitle(task.title);
    setDraftNote(task.note ?? "");
    setDraftDate(task.task_date);
    setEditing(true);
    setMenuOpen(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function saveEdit() {
    const title = draftTitle.trim();
    if (!title) return; // 标题不可为空
    const note = draftNote.trim() ? draftNote.trim() : null;
    const patch =
      note === (task.note ?? null) && draftDate === task.task_date
        ? { title }
        : { title, note, task_date: draftDate };
    if (patch.title !== task.title || "note" in patch || "task_date" in patch) {
      void editTask(task.id, patch);
    }
    setEditing(false);
  }

  function onMenuDelete() {
    setMenuOpen(false);
    void deleteTask(task.id);
  }

  if (editing) {
    return (
      <div className={styles.editor}>
        <input
          ref={titleRef}
          className={styles.editorTitle}
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
            else if (e.key === "Escape") cancelEdit();
          }}
          placeholder="任务标题"
        />
        <textarea
          className={styles.editorNote}
          value={draftNote}
          onChange={(e) => setDraftNote(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelEdit();
          }}
          placeholder="备注（可选）"
          rows={2}
        />
        <div className={styles.editorFooter}>
          <input
            type="date"
            className={styles.editorDate}
            value={draftDate}
            onChange={(e) => setDraftDate(e.currentTarget.value)}
          />
          <div className={styles.editorActions}>
            <button className={styles.cancelBtn} onClick={cancelEdit}>
              取消
            </button>
            <button className={styles.saveBtn} onClick={saveEdit}>
              保存
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <button
        className={styles.status}
        onClick={() => void toggleStatus(task.id)}
        title={statusTitle}
        aria-label={statusTitle}
      >
        <span className={styles.statusIcon} data-status={isOverdue ? "overdue" : task.status}>
          <StatusIcon size={18} />
        </span>
      </button>

      <div className={styles.main}>
        <span
          className={styles.title}
          data-status={task.status}
        >
          {task.title}
        </span>
        {task.note && (
          <span className={styles.note} data-status={task.status} title={task.note}>
            {task.note}
          </span>
        )}
      </div>

      <div className={styles.more}>
        <button
          ref={moreBtnRef}
          className={styles.moreBtn}
          onClick={toggleMenu}
          title="更多"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {menuOpen &&
        createPortal(
          <div
            ref={menuBoxRef}
            className={styles.menu}
            style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
            role="menu"
          >
            <button className={styles.menuItem} onClick={startEdit}>
              <Pencil size={14} /> 编辑
            </button>
            <button className={styles.menuItem} onClick={onMenuDelete}>
              <Trash2 size={14} /> 删除
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
