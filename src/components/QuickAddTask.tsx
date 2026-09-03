import { useState } from "react";
import { Plus } from "lucide-react";
import { useTaskStore } from "../stores/taskStore";
import { formatDate } from "../utils/date";
import styles from "./QuickAddTask.module.css";

export function QuickAddTask() {
  const addTask = useTaskStore((s) => s.addTask);
  const currentDate = useTaskStore((s) => s.currentDate);
  const [value, setValue] = useState("");

  function submit() {
    const t = value.trim();
    if (!t) return;
    void addTask(t);
    setValue("");
  }

  const { relative } = formatDate(currentDate);
  const placeholder = `${relative || "这天"}要做什么？`;

  return (
    <div className={styles.row}>
      <Plus size={16} className={styles.icon} />
      <input
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          else if (e.key === "Escape") setValue("");
        }}
      />
    </div>
  );
}
