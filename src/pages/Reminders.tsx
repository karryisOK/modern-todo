import { useEffect, useState } from "react";
import { ArrowLeft, Bell, CalendarRange, Save, Trash2 } from "lucide-react";
import { useSettingsStore, type ReminderConfig } from "../stores/settingsStore";
import { todayKey } from "../utils/date";
import styles from "./Reminders.module.css";

interface Props {
  onBack: () => void;
}

export function Reminders({ onBack }: Props) {
  const reminder = useSettingsStore((s) => s.reminder);
  const saveReminder = useSettingsStore((s) => s.saveReminder);

  const [text, setText] = useState("");
  const [start, setStart] = useState(todayKey());
  const [end, setEnd] = useState(todayKey());

  // Load the saved config once when entering the page.
  useEffect(() => {
    if (reminder) {
      setText(reminder.text);
      setStart(reminder.start);
      setEnd(reminder.end);
    }
  }, [reminder]);

  const trimmed = text.trim();
  const rangeOk = start <= end;

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  function handleSave() {
    if (!trimmed || !rangeOk) return;
    const cfg: ReminderConfig = { text: trimmed, start, end };
    void saveReminder(cfg);
    showToast("提醒已保存");
  }

  function handleClear() {
    setText("");
    void saveReminder(null);
    showToast("提醒已清除");
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <button className={styles.backBtn} onClick={onBack} title="返回今日">
          <ArrowLeft size={15} />
          <span>今日</span>
        </button>
        <span className={styles.pageTitle}>
          <Bell size={13} />
          提醒
        </span>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Bell size={14} />
          <span>提醒内容</span>
        </div>
        <textarea
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          placeholder="输入要在今日页滚动展示的提醒文字…"
          rows={3}
          maxLength={120}
        />

        <div className={styles.sectionHeader}>
          <CalendarRange size={14} />
          <span>生效日期范围</span>
        </div>
        <div className={styles.rangeRow}>
          <label className={styles.rangeLabel}>
            开始
            <input
              type="date"
              className={styles.dateInput}
              value={start}
              onChange={(e) => setStart(e.currentTarget.value)}
            />
          </label>
          <span className={styles.rangeDash}>至</span>
          <label className={styles.rangeLabel}>
            结束
            <input
              type="date"
              className={styles.dateInput}
              value={end}
              onChange={(e) => setEnd(e.currentTarget.value)}
            />
          </label>
        </div>
        {!rangeOk && <p className={styles.rangeError}>结束日期不能早于开始日期</p>}

        <div className={styles.actions}>
          <button
            className={styles.clearBtn}
            onClick={handleClear}
            title="清除提醒（今日页不再显示）"
          >
            <Trash2 size={12} />
            清除
          </button>
          <button
            className={styles.saveBtn}
            disabled={!trimmed || !rangeOk}
            onClick={handleSave}
          >
            <Save size={12} />
            保存
          </button>
        </div>
      </div>

      <p className={styles.hint}>
        提醒将在生效日期内的「今日」页顶部以小字滚动播放。
      </p>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
