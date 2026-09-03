import { useTaskStore } from "../stores/taskStore";
import { todayKey, addDays } from "../utils/date";
import styles from "./CarryOverModal.module.css";

// 只在每次启动后提醒一次：用户处理（或忽略）后，本会话内不再弹出。
let dismissedThisSession = false;

/** "2026-08-16" → "8月16日"（跨年时带上年份）。 */
function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const yearNow = new Date().getFullYear();
  return (y !== yearNow ? `${y}年` : "") + `${m}月${d}日`;
}

export function CarryOverModal() {
  const openPast = useTaskStore((s) => s.openPast);
  const currentDate = useTaskStore((s) => s.currentDate);
  const carryOverPast = useTaskStore((s) => s.carryOverPast);
  const setDate = useTaskStore((s) => s.setDate);
  const clearPastOpen = useTaskStore((s) => s.clearPastOpen);

  const isToday = currentDate === todayKey();
  const shouldShow = !dismissedThisSession && isToday && !!openPast && openPast.length > 0;
  if (!shouldShow) return null;

  // Group by source date, oldest first.
  const groups = new Map<string, number>();
  for (const t of openPast) {
    groups.set(t.task_date, (groups.get(t.task_date) ?? 0) + 1);
  }
  const dateGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const latestDate = dateGroups[dateGroups.length - 1][0];
  const yesterday = addDays(todayKey(), -1);
  const onlyYesterday = dateGroups.length === 1 && latestDate === yesterday;
  const total = openPast.length;

  function close() {
    dismissedThisSession = true;
    clearPastOpen();
  }

  function handleCarry() {
    void carryOverPast();
    close();
  }

  function handleView() {
    void setDate(latestDate);
    close();
  }

  return (
    <div className={styles.overlay} onClick={close}>
      <div
        className={styles.modal}
        role="alertdialog"
        aria-label="未完成任务提醒"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.icon}>🔔</div>
        <p className={styles.title}>
          {onlyYesterday ? "昨日有未完成的任务" : "有任务过了期限还没完成"}
        </p>
        <p className={styles.text}>
          共 <strong>{total}</strong> 个任务未完成，分别来自：
        </p>
        <ul className={styles.dateList}>
          {dateGroups.map(([date, count]) => (
            <li key={date} className={styles.dateRow}>
              <span className={date === yesterday ? styles.dateOld : undefined}>
                {formatDateLabel(date)}
                {date === yesterday && "（昨天）"}
              </span>
              <span className={styles.count}>{count} 个</span>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button className={styles.btnGhost} onClick={handleView}>
            查看任务
          </button>
          <button className={styles.btnPrimary} onClick={handleCarry}>
            移到今天
          </button>
        </div>
        <button className={styles.btnClose} onClick={close} title="忽略" aria-label="忽略">
          ×
        </button>
      </div>
    </div>
  );
}
