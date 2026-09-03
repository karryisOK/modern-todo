import { useEffect, useState } from "react";
import {
  Download,
  HardDriveDownload,
  Keyboard,
  Monitor,
  Pin,
  Sparkles,
  Upload,
} from "lucide-react";
import { useSettingsStore, type ThemeMode } from "../stores/settingsStore";
import {
  exportBackup,
  pickBackupFile,
  restoreBackup,
  validateBackupJson,
  type BackupFile,
} from "../services/backup";
import { DEFAULT_ACCEL, eventToAccel, formatAccel } from "../services/shortcut";
import styles from "./Settings.module.css";

interface PendingImport {
  fileName: string;
  taskCount: number;
  historyCount: number;
  exportedAt: string;
  data: BackupFile;
}

export function Settings() {
  const theme = useSettingsStore((s) => s.theme);
  const alwaysOnTop = useSettingsStore((s) => s.alwaysOnTop);
  const autostart = useSettingsStore((s) => s.autostart);
  const shortcut = useSettingsStore((s) => s.shortcut);
  const shortcutError = useSettingsStore((s) => s.shortcutError);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setAlwaysOnTop = useSettingsStore((s) => s.setAlwaysOnTop);
  const setAutostart = useSettingsStore((s) => s.setAutostart);
  const setShortcut = useSettingsStore((s) => s.setShortcut);
  const setShortcutError = useSettingsStore((s) => s.setShortcutError);

  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [recording, setRecording] = useState(false);

  // Recording mode: capture the next key combo as the new global shortcut.
  useEffect(() => {
    if (!recording) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setShortcutError(null);
        return;
      }
      const r = eventToAccel(e);
      if (r.waiting) return; // only modifiers so far — keep waiting
      setRecording(false);
      if (!r.ok || !r.accel) {
        setShortcutError(r.reason ?? "无法识别的按键组合");
        return;
      }
      void applyNewShortcut(r.accel);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const applyNewShortcut = async (accel: string): Promise<void> => {
    const ok = await setShortcut(accel);
    if (ok) showToast(`快捷键已更新为 ${formatAccel(accel)}`, "ok");
    // On failure the store already holds the conflict error message.
  };

  const handleResetShortcut = async () => {
    setRecording(false);
    await applyNewShortcut(DEFAULT_ACCEL);
  };

  const showToast = (msg: string, kind: "ok" | "err") => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 3200);
  };

  const handleExport = async () => {
    try {
      const res = await exportBackup();
      if (!res.cancelled) showToast("备份已导出", "ok");
    } catch (err) {
      showToast(`备份导出失败：${errText(err)}`, "err");
    }
  };

  const handleImportPick = async () => {
    try {
      const picked = await pickBackupFile();
      if (picked.cancelled) return;
      const result = validateBackupJson(picked.content ?? "");
      if (!result.ok) {
        showToast(result.reason, "err");
        return;
      }
      setPending({
        fileName: picked.fileName ?? "",
        taskCount: result.data.tasks.length,
        historyCount: result.data.taskHistory.length,
        exportedAt: result.data.exportedAt,
        data: result.data,
      });
    } catch (err) {
      showToast(`读取备份失败：${errText(err)}`, "err");
    }
  };

  const handleConfirmRestore = async () => {
    if (!pending) return;
    setRestoring(true);
    try {
      // On success the app reloads itself (location.reload in restoreBackup).
      await restoreBackup(pending.data);
    } catch (err) {
      setRestoring(false);
      setPending(null);
      showToast(`恢复失败，当前数据未受影响：${errText(err)}`, "err");
    }
  };

  const themes: { key: ThemeMode; label: string }[] = [
    { key: "light", label: "浅色" },
    { key: "dark", label: "深色" },
    { key: "system", label: "跟随系统" },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Monitor size={14} />
          <span>外观</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>主题</span>
          <div className={styles.themeGroup}>
            {themes.map((t) => (
              <button
                key={t.key}
                className={`${styles.themeBtn} ${theme === t.key ? styles.themeBtnActive : ""}`}
                onClick={() => void setTheme(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Pin size={14} />
          <span>窗口</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>始终置顶</span>
          <Toggle checked={alwaysOnTop} onChange={(v) => void setAlwaysOnTop(v)} />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Sparkles size={14} />
          <span>启动</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>开机自动启动</span>
          <Toggle checked={autostart} onChange={(v) => void setAutostart(v)} />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <HardDriveDownload size={14} />
          <span>数据</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>导出备份</span>
          <button className={styles.dataBtn} onClick={() => void handleExport()}>
            <Download size={12} />
            导出到文件
          </button>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>导入备份</span>
          <button className={styles.dataBtn} onClick={() => void handleImportPick()}>
            <Upload size={12} />
            从文件恢复
          </button>
        </div>
        <p className={styles.dataHint}>
          备份为 JSON 文件，仅保存在本地，不上传服务器。恢复将替换当前任务和历史记录。
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Keyboard size={14} />
          <span>快捷键</span>
        </div>
        <div className={styles.shortcutRow}>
          <span className={styles.label}>显示 / 隐藏 摩登待办</span>
          <div className={styles.shortcutCtl}>
            {recording ? (
              <kbd className={`${styles.kbd} ${styles.kbdRecording}`}>
                按下新的快捷键…（Esc 取消）
              </kbd>
            ) : (
              <kbd className={styles.kbd}>{formatAccel(shortcut)}</kbd>
            )}
            <button
              className={styles.dataBtn}
              onClick={() => {
                setShortcutError(null);
                setRecording((v) => !v);
              }}
            >
              {recording ? "取消" : "修改"}
            </button>
            <button className={styles.dataBtn} onClick={() => void handleResetShortcut()}>
              恢复默认
            </button>
          </div>
        </div>
        {shortcutError && <p className={styles.shortcutError}>{shortcutError}</p>}
        <p className={styles.dataHint}>
          全局快捷键在任何界面都可触发；若与其他程序冲突，注册时会提示。
        </p>
      </div>

      <p className={styles.hint}>摩登待办 1.0.0 · 完全本地 · 无账号 · 无网络依赖</p>

      {toast && (
        <div className={`${styles.toast} ${toast.kind === "err" ? styles.toastErr : ""}`}>
          {toast.msg}
        </div>
      )}

      {pending && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard}>
            <div className={styles.confirmTitle}>恢复此备份？</div>
            <div className={styles.confirmText}>
              将从 <b>{pending.fileName || "备份文件"}</b> 恢复：
              <br />
              {pending.taskCount} 个任务 · {pending.historyCount} 条历史记录
            </div>
            <div className={styles.confirmWarn}>
              恢复此备份将替换当前任务和历史记录，当前数据将被覆盖。
            </div>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnGhost}
                disabled={restoring}
                onClick={() => setPending(null)}
              >
                取消
              </button>
              <button
                className={styles.btnDanger}
                disabled={restoring}
                onClick={() => void handleConfirmRestore()}
              >
                {restoring ? "恢复中…" : "继续恢复"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.toggleKnob} />
    </button>
  );
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
