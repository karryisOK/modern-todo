import { useEffect, useMemo, useState } from "react";
import * as db from "../database/db";
import type { Task } from "../types";
import { formatDate } from "../utils/date";
import styles from "./History.module.css";

interface DayGroup {
  key: string;
  label: string;
  tasks: Task[];
}

export function History() {
  const [dates, setDates] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const d = await db.listDatesWithTasks();
        if (cancelled) return;
        setDates(d);
        if (d.length === 0) {
          setTasks([]);
          return;
        }
        const first = d[d.length - 1]; // earliest date
        const last = d[0]; // latest date
        const all = await db.listTasksByDateRange(first, last);
        if (!cancelled) setTasks(all);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo<DayGroup[]>(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      (map[t.task_date] ??= []).push(t);
    }
    return dates.map((key) => {
      const g = map[key] ?? [];
      g.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const { short, weekday, relative } = formatDate(key);
      return { key, label: relative || `${short} · ${weekday}`, tasks: g };
    });
  }, [dates, tasks]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>历史记录</div>
        {!loading && groups.length > 0 && (
          <div className={styles.meta}>{groups.length} 天 · {tasks.length} 项</div>
        )}
      </div>

      {loading && <div className={styles.empty}>加载中…</div>}

      {!loading && groups.length === 0 && (
        <div className={styles.empty}>还没有历史记录</div>
      )}

      {!loading && groups.length > 0 && (
        <div className={styles.list}>
          {groups.map((g) => (
            <section key={g.key} className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>{g.label}</span>
                <span className={styles.sectionCount}>{g.tasks.length} 项</span>
              </div>
              <ul className={styles.sectionList}>
                {g.tasks.map((t) => (
                  <li key={t.id} className={styles.historyItem} data-status={t.status}>
                    <span className={styles.itemTitle}>{t.title}</span>
                    {t.status === "done" && <span className={styles.badgeDone}>已完成</span>}
                    {t.status === "doing" && <span className={styles.badgeDoing}>进行中</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
