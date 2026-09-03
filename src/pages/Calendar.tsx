import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import * as db from "../database/db";
import type { Task, TaskStatus } from "../types";
import { fromKey, todayKey } from "../utils/date";
import { useTaskStore } from "../stores/taskStore";
import styles from "./Calendar.module.css";

interface Props {
  /** 日期被点击后调用 — 通常用来切回 Today 页。 */
  onPickDate?: () => void;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTHS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

const STATUS_COLOR: Record<TaskStatus, string> = {
  doing: "var(--status-doing)",
  done: "var(--status-done)",
};

const STATUS_ORDER: TaskStatus[] = ["doing", "done"];

export function Calendar({ onPickDate }: Props) {
  const initial = fromKey(todayKey());
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [picker, setPicker] = useState<"year" | "month" | null>(null);

  // Load all tasks for the visible month.
  useEffect(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth + 1, 0);
    const startKey = toKey(first);
    const endKey = toKey(last);
    setLoading(true);
    void db
      .listTasksByDateRange(startKey, endKey)
      .then((rows) => setTasks(rows))
      .finally(() => setLoading(false));
  }, [viewYear, viewMonth]);

  // Build day cells (6 rows × 7 cols).
  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = firstDay.getDay();
    const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
    const out: { key: string; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push({
        key: toKey(d),
        isCurrentMonth: d.getMonth() === viewMonth,
      });
    }
    return out;
  }, [viewYear, viewMonth]);

  // Group tasks by date and extract up to 3 status dots.
  const dayMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      (map[t.task_date] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const setDate = useTaskStore((s) => s.setDate);
  const today = todayKey();

  function onPick(key: string) {
    void setDate(key);
    onPickDate?.();
  }

  const years = Array.from({ length: 21 }, (_, i) => viewYear - 10 + i);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.nav} onClick={prevMonth} aria-label="上个月">
          <ChevronLeft size={18} />
        </button>

        <div className={styles.titleGroup}>
          <button
            className={styles.titleBtn}
            onClick={() => setPicker((v) => (v === "year" ? null : "year"))}
            aria-label="选择年份"
          >
            {viewYear}年
            <ChevronDown size={12} />
          </button>
          <button
            className={styles.titleBtn}
            onClick={() => setPicker((v) => (v === "month" ? null : "month"))}
            aria-label="选择月份"
          >
            {viewMonth + 1}月
            <ChevronDown size={12} />
          </button>
        </div>

        <button className={styles.nav} onClick={nextMonth} aria-label="下个月">
          <ChevronRight size={18} />
        </button>
      </div>

      {picker === "year" && (
        <div className={styles.quickList}>
          <button
            className={styles.quickNav}
            onClick={() => setViewYear((y) => y - 10)}
            aria-label="更早"
          >
            ‹‹
          </button>
          <div className={styles.quickGrid}>
            {years.map((y) => (
              <button
                key={y}
                className={`${styles.quickItem} ${y === viewYear ? styles.quickActive : ""}`}
                onClick={() => {
                  setViewYear(y);
                  setPicker(null);
                }}
              >
                {y}
              </button>
            ))}
          </div>
          <button
            className={styles.quickNav}
            onClick={() => setViewYear((y) => y + 10)}
            aria-label="更晚"
          >
            ››
          </button>
        </div>
      )}

      {picker === "month" && (
        <div className={styles.quickList}>
          <div className={styles.quickGrid}>
            {MONTHS.map((m, i) => (
              <button
                key={m}
                className={`${styles.quickItem} ${i === viewMonth ? styles.quickActive : ""}`}
                onClick={() => {
                  setViewMonth(i);
                  setPicker(null);
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {picker === null && loading && <div className={styles.loading}>加载中…</div>}

      {picker === null && !loading && (
        <>
          <div className={styles.weekdays}>
            {WEEKDAYS.map((w) => (
              <div key={w} className={styles.weekday}>
                {w}
              </div>
            ))}
          </div>

          <div className={styles.grid}>
            {cells.map((c) => {
              const dayNum = Number(c.key.split("-")[2]);
              const isToday = c.key === today;
              const dayTasks = dayMap[c.key] ?? [];
              const dots = computeDots(dayTasks);
              return (
                <button
                  key={c.key}
                  className={`${styles.cell} ${c.isCurrentMonth ? "" : styles.otherMonth} ${isToday ? styles.todayCell : ""}`}
                  onClick={() => void onPick(c.key)}
                  title={`${c.key}：${dayTasks.length} 项`}
                >
                  <span className={styles.dayNum}>{dayNum}</span>
                  {dayTasks.length > 0 && (
                    <span className={styles.count}>{dayTasks.length}</span>
                  )}
                  {dots.length > 0 && (
                    <span className={styles.dots}>
                      {dots.map((s, i) => (
                        <span
                          key={i}
                          className={styles.dot}
                          style={{ background: STATUS_COLOR[s] }}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function computeDots(list: Task[]): TaskStatus[] {
  const counts: Record<TaskStatus, number> = { doing: 0, done: 0 };
  for (const t of list) counts[t.status]++;
  const out: TaskStatus[] = [];
  for (const s of STATUS_ORDER) {
    if (counts[s] > 0) out.push(s);
    if (out.length >= 2) break;
  }
  return out;
}

function toKey(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
