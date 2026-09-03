// Settings store (Zustand). Manages all user preferences for Phase 3.
// Persisted to SQLite `settings` table.

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable } from "@tauri-apps/plugin-autostart";
import * as settingsDb from "../database/settings";
import { DEFAULT_ACCEL } from "../services/shortcut";

export type ThemeMode = "light" | "dark" | "system";

/** Reminder banner config: custom text shown during [start, end] (inclusive). */
export interface ReminderConfig {
  text: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

interface SettingsState {
  theme: ThemeMode;
  alwaysOnTop: boolean;
  autostart: boolean;
  shortcut: string; // accelerator string, e.g. "ctrl+shift+space"
  reminder: ReminderConfig | null;
  shortcutError: string | null;
  loaded: boolean;

  init: () => Promise<void>;
  setTheme: (mode: ThemeMode) => Promise<void>;
  setAlwaysOnTop: (on: boolean) => Promise<void>;
  setAutostart: (on: boolean) => Promise<void>;
  setShortcut: (accel: string) => Promise<boolean>;
  saveReminder: (cfg: ReminderConfig | null) => Promise<void>;
  setShortcutError: (msg: string | null) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "system",
  alwaysOnTop: false,
  autostart: false,
  shortcut: DEFAULT_ACCEL,
  reminder: null,
  shortcutError: null,
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    try {
      const [theme, alwaysOnTop, autostart, shortcut, reminder] = await Promise.all([
        settingsDb.getSetting<ThemeMode>("theme", "system"),
        settingsDb.getSetting<boolean>("always_on_top", false),
        settingsDb.getSetting<boolean>("autostart", false),
        settingsDb.getSetting<string>("shortcut", DEFAULT_ACCEL),
        settingsDb.getSetting<ReminderConfig | null>("reminder", null),
      ]);
      set({ theme, alwaysOnTop, autostart, shortcut, reminder, loaded: true });
      applyTheme(theme);
      applyAlwaysOnTop(alwaysOnTop);
      // Apply the saved global shortcut now that the webview is up.
      await applyShortcut(shortcut);
    } catch (err) {
      console.error("[settings] init failed:", err);
      set({ loaded: true });
    }
  },

  setTheme: async (mode) => {
    set({ theme: mode });
    applyTheme(mode);
    await settingsDb.setSetting("theme", mode);
  },

  setAlwaysOnTop: async (on) => {
    set({ alwaysOnTop: on });
    applyAlwaysOnTop(on);
    await settingsDb.setSetting("always_on_top", on);
  },

  setAutostart: async (on) => {
    set({ autostart: on });
    await settingsDb.setSetting("autostart", on);
    try {
      if (on) {
        await enable();
      } else {
        await disable();
      }
    } catch (err) {
      console.error("[settings] autostart failed:", err);
    }
  },

  setShortcut: async (accel) => {
    const ok = await applyShortcut(accel);
    if (!ok) return false;
    // Persist + reflect only after the OS accepted the registration.
    set({ shortcut: accel, shortcutError: null });
    try {
      await settingsDb.setSetting("shortcut", accel);
    } catch (err) {
      console.error("[settings] persist shortcut failed:", err);
    }
    return true;
  },

  saveReminder: async (cfg) => {
    set({ reminder: cfg });
    try {
      await settingsDb.setSetting("reminder", cfg);
    } catch (err) {
      console.error("[settings] persist reminder failed:", err);
    }
  },

  setShortcutError: (msg) => set({ shortcutError: msg }),
}));

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
}

async function applyAlwaysOnTop(on: boolean) {
  try {
    await getCurrentWindow().setAlwaysOnTop(on);
  } catch {
    // Non-Tauri environments (e.g. browser preview) — ignore.
  }
}

/** Register via Rust; returns false (and sets error) on conflict/parse fail. */
async function applyShortcut(accel: string): Promise<boolean> {
  try {
    await invoke("set_global_shortcut", { accel });
    useSettingsStore.getState().setShortcutError(null);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    useSettingsStore.getState().setShortcutError(msg);
    return false;
  }
}
