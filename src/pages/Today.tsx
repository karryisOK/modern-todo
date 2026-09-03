import { useEffect } from "react";
import { useTaskStore } from "../stores/taskStore";
import { Header } from "../components/Header";
import { ProgressBar } from "../components/ProgressBar";
import { TaskList } from "../components/TaskList";
import { QuickAddTask } from "../components/QuickAddTask";
import { CarryOverModal } from "../components/CarryOverModal";
import { ReminderTicker } from "../components/ReminderTicker";
import styles from "./Today.module.css";

export function Today() {
  const init = useTaskStore((s) => s.init);
  const lastDeleted = useTaskStore((s) => s.lastDeleted);
  const undoDelete = useTaskStore((s) => s.undoDelete);
  const clearUndo = useTaskStore((s) => s.clearUndo);

  useEffect(() => {
    void init();
  }, [init]);

  // Auto-dismiss the undo toast after a few seconds.
  useEffect(() => {
    if (!lastDeleted) return;
    const timer = setTimeout(() => clearUndo(), 4500);
    return () => clearTimeout(timer);
  }, [lastDeleted, clearUndo]);

  return (
    <div className={styles.page}>
      <Header />
      <ProgressBar />
      <ReminderTicker />
      <div className={styles.body}>
        <TaskList />
      </div>
      <QuickAddTask />
      <CarryOverModal />
      {lastDeleted && (
        <div className={styles.toast}>
          <span className={styles.toastText}>任务已删除</span>
          <button className={styles.toastBtn} onClick={() => void undoDelete()}>
            撤销
          </button>
        </div>
      )}
    </div>
  );
}
