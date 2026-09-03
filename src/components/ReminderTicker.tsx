import { Bell } from "lucide-react";
import { useSettingsStore } from "../stores/settingsStore";
import { todayKey } from "../utils/date";
import styles from "./ReminderTicker.module.css";

/**
 * 今日页顶部滚动提醒条：在生效日期范围内循环滚动播放自定义文本。
 * 悬停暂停。
 */
export function ReminderTicker() {
  const reminder = useSettingsStore((s) => s.reminder);
  if (!reminder) return null;

  const text = reminder.text.trim();
  if (!text) return null;

  const today = todayKey();
  if (today < reminder.start || today > reminder.end) return null;

  // 长文本滚得慢一点，保证可读性。
  const duration = Math.max(10, Math.round(text.length * 0.4));

  return (
    <div className={styles.ticker} title="提醒（悬停暂停）">
      <Bell size={11} className={styles.bell} />
      <div className={styles.viewport}>
        <span
          className={styles.text}
          style={{ animationDuration: `${duration}s` }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
