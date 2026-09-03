import { useTaskStore } from "../stores/taskStore";
import styles from "./ProgressBar.module.css";

export function ProgressBar() {
  const tasks = useTaskStore((s) => s.tasks);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = total === 0 ? 0 : (done / total) * 100;

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>
        <span className={styles.done}>{done}</span>
        <span className={styles.sep}> / </span>
        <span className={styles.total}>{total}</span>
        <span className={styles.text}> 已完成</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
