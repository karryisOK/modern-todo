import { useEffect, useState } from "react";
import { CalendarDays, CheckSquare, ListTodo, Settings as SettingsIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { Today } from "./pages/Today";
import { Calendar } from "./pages/Calendar";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Reminders } from "./pages/Reminders";
import { useSettingsStore } from "./stores/settingsStore";
import styles from "./App.module.css";

type Tab = "today" | "calendar" | "history" | "settings" | "reminders";

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: "today", label: "今日", Icon: CheckSquare },
  { key: "calendar", label: "日历", Icon: CalendarDays },
  { key: "history", label: "历史", Icon: ListTodo },
  { key: "settings", label: "设置", Icon: SettingsIcon },
];

function App() {
  const [tab, setTab] = useState<Tab>("today");
  const initSettings = useSettingsStore((s) => s.init);
  const theme = useSettingsStore((s) => s.theme);

  // Initialize settings (load theme / always-on-top / autostart from DB).
  useEffect(() => {
    void initSettings();
  }, [initSettings]);

  // Listen for system theme changes when theme = "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function applySystem() {
      document.documentElement.removeAttribute("data-theme");
    }
    applySystem();
    mql.addEventListener("change", applySystem);
    return () => mql.removeEventListener("change", applySystem);
  }, [theme]);

  // Listen for tray events from the Rust backend.
  useEffect(() => {
    const unlistenToday = listen("to-today", () => {
      setTab("today");
    });
    const unlistenSettings = listen("open-settings", () => {
      setTab("settings");
    });
    return () => {
      void unlistenToday.then((f) => f());
      void unlistenSettings.then((f) => f());
    };
  }, []);

  // Bell (提醒) entry in the header → open the Reminders page.
  useEffect(() => {
    function onOpenReminders() {
      setTab("reminders");
    }
    window.addEventListener("open-reminders", onOpenReminders);
    return () => window.removeEventListener("open-reminders", onOpenReminders);
  }, []);

  return (
    <div className="app-shell" data-tauri-drag-region>
      <div className={styles.pageArea}>
        {tab === "today" && <Today />}
        {tab === "calendar" && <Calendar onPickDate={() => setTab("today")} />}
        {tab === "history" && <History />}
        {tab === "settings" && <Settings />}
        {tab === "reminders" && <Reminders onBack={() => setTab("today")} />}
      </div>
      <nav className={styles.nav} role="tablist">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              className={`${styles.navBtn} ${active ? styles.navBtnActive : ""}`}
              onClick={() => setTab(key)}
              title={label}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
