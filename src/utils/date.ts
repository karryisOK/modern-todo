// Local-date helpers. All task dates are stored as YYYY-MM-DD and treated as
// local calendar days (no timezone drift).

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Convert a Date to a YYYY-MM-DD key using local time.
export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Parse a YYYY-MM-DD key into a local Date at midnight.
export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, days: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

export function isSameDay(a: string, b: string): boolean {
  return a === b;
}

export function isToday(key: string): boolean {
  return key === todayKey();
}

export interface DateDisplay {
  /** 例如 "9月2日" */
  short: string;
  /** 例如 "星期三" */
  weekday: string;
  /** 例如 "今天" / "昨天" / "明天" 或空 */
  relative: string;
}

export function formatDate(key: string): DateDisplay {
  const d = fromKey(key);
  const short = `${d.getMonth() + 1}月${d.getDate()}日`;
  const weekday = WEEKDAYS[d.getDay()];
  let relative = "";
  const today = todayKey();
  if (key === today) relative = "今天";
  else if (key === addDays(today, -1)) relative = "昨天";
  else if (key === addDays(today, 1)) relative = "明天";
  return { short, weekday, relative };
}
