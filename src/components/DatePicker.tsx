import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useTaskStore } from "../stores/taskStore";
import { fromKey, todayKey } from "../utils/date";
import styles from "./DatePicker.module.css";

interface Props {
  onClose: () => void;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTHS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

export function DatePicker({ onClose }: Props) {
  const currentDate = useTaskStore((s) => s.currentDate);
  const setDate = useTaskStore((s) => s.setDate);

  const initial = fromKey(currentDate);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth()); // 0-indexed
  const [picker, setPicker] = useState<"year" | "month" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

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

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
  const today = todayKey();

  function handlePick(key: string) {
    void setDate(key);
    onClose();
  }

  const cells: { key: string; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    cells.push({ key, isCurrentMonth: d.getMonth() === viewMonth });
  }

  // 年份范围：当前年 ± 10
  const years = Array.from({ length: 21 }, (_, i) => viewYear - 10 + i);

  return (
    <div
      className={styles.popover}
      ref={rootRef}
      role="dialog"
      aria-label="选择日期"
      data-tauri-drag-region="false"
    >
      <div className={styles.header}>
        <button className={styles.monthNav} onClick={prevMonth} aria-label="上个月">
          <ChevronLeft size={16} />
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

        <button className={styles.monthNav} onClick={nextMonth} aria-label="下个月">
          <ChevronRight size={16} />
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

      {picker === null && (
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
              const isSelected = c.key === currentDate;
              return (
                <button
                  key={c.key}
                  className={`${styles.cell} ${c.isCurrentMonth ? "" : styles.otherMonth} ${isSelected ? styles.selected : ""}`}
                  onClick={() => handlePick(c.key)}
                  title={c.key}
                >
                  <span className={isToday ? styles.todayDot : ""} />
                  {dayNum}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
