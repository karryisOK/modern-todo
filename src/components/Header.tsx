import { useState } from "react";
import { Bell, CalendarCheck, ChevronLeft, ChevronRight, Minus, Pin, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTaskStore } from "../stores/taskStore";
import { useSettingsStore } from "../stores/settingsStore";
import { formatDate, isToday } from "../utils/date";
import { DatePicker } from "./DatePicker";
import styles from "./Header.module.css";

export function Header() {
  const currentDate = useTaskStore((s) => s.currentDate);
  const prevDay = useTaskStore((s) => s.prevDay);
  const nextDay = useTaskStore((s) => s.nextDay);
  const goToToday = useTaskStore((s) => s.goToToday);
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop);
  const setAlwaysOnTop = useSettingsStore((s) => s.setAlwaysOnTop);

  const [pickerOpen, setPickerOpen] = useState(false);

  const { short, weekday, relative } = formatDate(currentDate);
  const today = isToday(currentDate);

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {}
  };

  const handleClose = async () => {
    try {
      // Rust side intercepts CloseRequested → prevent_close + hide (to tray).
      await getCurrentWindow().close();
    } catch {}
  };

  // Programmatic drag is NOT needed: the header uses the official
  // data-tauri-drag-region="deep" attribute. Tauri's injected script walks the
  // composed path and treats the whole header subtree as draggable while
  // automatically exempting buttons/inputs/role=button elements.

  return (
    <header className={styles.header} data-tauri-drag-region="deep">
      {/* Top bar: blank areas drag via header's deep region; buttons exempt. */}
      <div className={styles.topBar}>
        <button
          className={styles.bellBtn}
          onClick={() => window.dispatchEvent(new CustomEvent("open-reminders"))}
          title="提醒"
        >
          <Bell size={13} />
        </button>
        <button
          className={`${styles.winBtn} ${alwaysOnTop ? styles.pinActive : ""}`}
          onClick={() => void setAlwaysOnTop(!alwaysOnTop)}
          title={alwaysOnTop ? "取消置顶" : "始终置顶"}
        >
          <Pin size={11} />
        </button>
        <button
          className={styles.winBtn}
          onClick={() => void handleMinimize()}
          title="最小化"
        >
          <Minus size={11} />
        </button>
        <button
          className={`${styles.winBtn} ${styles.close}`}
          onClick={() => void handleClose()}
          title="关闭"
        >
          <X size={11} />
        </button>
      </div>

      {/* Date row: blank areas drag via header's deep region; buttons exempt. */}
      <div className={styles.dateRow}>
        <button
          className={styles.chevron}
          onClick={prevDay}
          title="前一天"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          className={`${styles.dateBtn} ${!today ? styles.dateBtnOffToday : ""}`}
          onClick={() => setPickerOpen((v) => !v)}
          title="选择日期"
        >
          <span className={styles.dateInfo}>
            <span className={styles.caption}>
              {today ? "今天" : relative || "查看"}
            </span>
            <span className={styles.mainDate}>
              {short}
              <span className={styles.dot}>·</span>
              {weekday}
            </span>
          </span>

          {!today && (
            <span
              role="button"
              tabIndex={0}
              className={styles.todayPill}
              onClick={(e) => {
                e.stopPropagation();
                void goToToday();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  void goToToday();
                }
              }}
              title="回到今天"
            >
              <CalendarCheck size={12} />
              回到今天
            </span>
          )}
        </button>

        <button
          className={styles.chevron}
          onClick={nextDay}
          title="后一天"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {pickerOpen && <DatePicker onClose={() => setPickerOpen(false)} />}
    </header>
  );
}
