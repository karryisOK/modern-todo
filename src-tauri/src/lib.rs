// DayPin Tauri backend — Phase 4.
// Registers global-shortcut, autostart, window-state, store, dialog and
// configures the tray menu. Also implements the local
// backup commands (export / import / transactional restore).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

// ---------------------------------------------------------------------------
// Global shortcut (user-customizable)
// ---------------------------------------------------------------------------

/// Tracks the currently registered accelerator so it can be swapped at runtime.
struct ShortcutState(Mutex<Option<String>>);

/// Register a new global shortcut, replacing the previous one.
/// `accel` format: "ctrl+shift+space" (case-insensitive, '+'-separated).
/// Empty string unregisters (disables) the shortcut.
#[tauri::command]
fn set_global_shortcut(
    app: tauri::AppHandle,
    state: tauri::State<'_, ShortcutState>,
    accel: String,
) -> Result<(), String> {
    let gs = app.global_shortcut();

    // Swap out the previous registration first.
    let prev = state.0.lock().unwrap().take();
    if let Some(prev_accel) = prev {
        if let Ok(prev_sc) = Shortcut::from_str(&prev_accel) {
            let _ = gs.unregister(prev_sc);
        }
    }

    if accel.trim().is_empty() {
        return Ok(()); // disabled — nothing registered
    }

    let sc = Shortcut::from_str(accel.trim())
        .map_err(|_| format!("无法识别的快捷键「{}」", accel.trim()))?;
    gs.register(sc)
        .map_err(|e| format!("注册失败，「{}」可能已被其他程序占用（{}）", accel.trim(), e))?;

    *state.0.lock().unwrap() = Some(accel.trim().to_string());
    Ok(())
}

// ---------------------------------------------------------------------------
// Backup commands
// ---------------------------------------------------------------------------

/// A task row inside a backup file (matches the `tasks` table columns).
#[derive(Deserialize)]
struct BackupTask {
    id: i64,
    title: String,
    #[serde(default)]
    note: Option<String>,
    task_date: String,
    status: String,
    #[serde(default)]
    priority: i64,
    #[serde(default)]
    sort_order: i64,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    completed_at: Option<String>,
}

/// A history row inside a backup file (matches the `task_history` columns).
#[derive(Deserialize)]
struct BackupHistory {
    task_id: i64,
    action: String,
    #[serde(default)]
    old_status: Option<String>,
    #[serde(default)]
    new_status: Option<String>,
    #[serde(default)]
    old_date: Option<String>,
    #[serde(default)]
    new_date: Option<String>,
    #[serde(default)]
    title_snapshot: Option<String>,
    created_at: String,
}

/// Known settings keys inside a backup file. Unknown keys are ignored.
#[derive(Deserialize, Default)]
struct BackupSettings {
    #[serde(default)]
    theme: Option<String>,
    #[serde(default)]
    always_on_top: Option<bool>,
    #[serde(default)]
    autostart: Option<bool>,
}

/// The whole backup payload sent by the frontend after validation.
#[derive(Deserialize)]
struct BackupPayload {
    #[serde(rename = "backupVersion")]
    backup_version: i64,
    #[serde(default)]
    tasks: Vec<BackupTask>,
    #[serde(default)]
    task_history: Vec<BackupHistory>,
    #[serde(default)]
    settings: Option<BackupSettings>,
}

fn valid_status(s: &str) -> bool {
    matches!(s, "todo" | "doing" | "done")
}

/// YYYY-MM-DD with a real calendar date (byte-based, never panics).
fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let num = |r: &[u8]| -> Option<u32> {
        if r.iter().all(|c| c.is_ascii_digit()) {
            std::str::from_utf8(r).ok()?.parse().ok()
        } else {
            None
        }
    };
    let (y, m, d) = match (num(&b[0..4]), num(&b[5..7]), num(&b[8..10])) {
        (Some(y), Some(m), Some(d)) => (y, m, d),
        _ => return false,
    };
    if !(1..=12).contains(&m) || d == 0 {
        return false;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let max = match m {
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    d <= max
}

/// Save dialog → write backup JSON to the chosen location.
/// Returns Ok(None) when the user cancels the dialog.
#[tauri::command]
async fn export_backup(
    app: tauri::AppHandle,
    file_name: String,
    content: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_file_name(&file_name)
            .add_filter("摩登待办 备份 (JSON)", &["json"])
            .blocking_save_file();
        let Some(path) = picked else {
            return Ok(None);
        };
        let path = match path {
            tauri_plugin_dialog::FilePath::Path(p) => p,
            _ => return Err("不支持的文件路径".to_string()),
        };
        std::fs::write(&path, &content).map_err(|e| format!("写入文件失败：{}", e))?;
        Ok(Some(path.display().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
struct ImportedFile {
    file_name: String,
    content: String,
}

/// Open dialog (.json) → read the file content.
/// Returns Ok(None) when the user cancels the dialog.
#[tauri::command]
async fn import_backup(app: tauri::AppHandle) -> Result<Option<ImportedFile>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .add_filter("摩登待办 备份 (JSON)", &["json"])
            .blocking_pick_file();
        let Some(path) = picked else {
            return Ok(None);
        };
        let path = match path {
            tauri_plugin_dialog::FilePath::Path(p) => p,
            _ => return Err("不支持的文件路径".to_string()),
        };
        let meta = std::fs::metadata(&path).map_err(|e| format!("读取文件失败：{}", e))?;
        if meta.len() > 10 * 1024 * 1024 {
            return Err("备份文件过大（超过 10MB）".to_string());
        }
        let content =
            std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{}", e))?;
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "backup.json".to_string());
        Ok(Some(ImportedFile {
            file_name,
            content,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Upsert one settings row inside the restore transaction.
async fn upsert_setting(
    tx: &mut sqlx::SqliteConnection,
    key: &str,
    value: String,
    stamp: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(value)
    .bind(stamp)
    .execute(tx)
    .await
    .map(|_| ())
    .map_err(|e| format!("恢复设置失败：{}", e))
}

/// Transactionally replace ALL DayPin data with the backup contents.
/// Any failure rolls back — the database keeps its previous state.
#[tauri::command]
async fn restore_backup(app: tauri::AppHandle, payload: String) -> Result<(), String> {
    // Defense in depth: validate again on the Rust side.
    let parsed: BackupPayload =
        serde_json::from_str(&payload).map_err(|e| format!("备份内容无效：{}", e))?;
    if parsed.backup_version != 1 {
        return Err(format!("不支持的备份版本：{}", parsed.backup_version));
    }
    for t in &parsed.tasks {
        if !valid_status(&t.status) {
            return Err(format!("任务状态非法：{}", t.status));
        }
        if !valid_date(&t.task_date) {
            return Err(format!("任务日期非法：{}", t.task_date));
        }
    }
    for h in &parsed.task_history {
        if h.created_at.get(0..10).map(valid_date) != Some(true) {
            return Err("历史记录时间非法".to_string());
        }
    }

    let db_path = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位数据目录：{}", e))?
        .join("daypin.db");
    if !db_path.exists() {
        return Err("未找到现有数据库文件".to_string());
    }

    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&db_path)
        .busy_timeout(std::time::Duration::from_secs(5));
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|e| format!("连接数据库失败：{}", e))?;

    let result: Result<(), String> = async {
        let mut tx = pool
            .begin()
            .await
            .map_err(|e| format!("开启事务失败：{}", e))?;

        // Wipe current data inside the transaction.
        sqlx::query("DELETE FROM task_history")
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("清空历史失败：{}", e))?;
        sqlx::query("DELETE FROM tasks")
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("清空任务失败：{}", e))?;
        sqlx::query("DELETE FROM settings")
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("清空设置失败：{}", e))?;

        // Restore tasks (explicit ids — history references them).
        for t in &parsed.tasks {
            sqlx::query(
                "INSERT INTO tasks (id, title, note, task_date, status, priority, sort_order, created_at, updated_at, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(t.id)
            .bind(&t.title)
            .bind(&t.note)
            .bind(&t.task_date)
            .bind(&t.status)
            .bind(t.priority)
            .bind(t.sort_order)
            .bind(&t.created_at)
            .bind(&t.updated_at)
            .bind(&t.completed_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("恢复任务失败：{}", e))?;
        }

        // Restore history.
        for h in &parsed.task_history {
            sqlx::query(
                "INSERT INTO task_history (task_id, action, old_status, new_status, old_date, new_date, title_snapshot, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(h.task_id)
            .bind(&h.action)
            .bind(&h.old_status)
            .bind(&h.new_status)
            .bind(&h.old_date)
            .bind(&h.new_date)
            .bind(&h.title_snapshot)
            .bind(&h.created_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("恢复历史失败：{}", e))?;
        }

        // Restore known settings. String values are stored raw, everything
        // else as JSON — same convention as the frontend setSetting().
        if let Some(s) = &parsed.settings {
            let stamp = t_stamp();
            if let Some(theme) = &s.theme {
                upsert_setting(&mut tx, "theme", theme.clone(), &stamp).await?;
            }
            if let Some(v) = s.always_on_top {
                upsert_setting(&mut tx, "always_on_top", v.to_string(), &stamp).await?;
            }
            if let Some(v) = s.autostart {
                upsert_setting(&mut tx, "autostart", v.to_string(), &stamp).await?;
            }
        }

        tx.commit()
            .await
            .map_err(|e| format!("提交事务失败：{}", e))?;
        Ok(())
    }
    .await;

    // Close the extra connection to release the file handle.
    let _ = pool.close().await;
    result
}

/// Timestamp (epoch seconds as text) for settings.updated_at on restore.
fn t_stamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

/// macOS：让 WKWebView 及其承载网页的 NSScrollView 完全透明。
/// CSS 够不到这两层原生表面——系统「始终显示滚动条」时 NSScrollView 会
/// 画出白色轨道、WKWebView 默认绘制不透明白底，深色模式下表现为右边缘白条。
#[cfg(target_os = "macos")]
fn apply_macos_transparent_webview(app: &tauri::AppHandle) {
    use objc::runtime::Object;
    use objc::{class, msg_send, sel, sel_impl};
    use tauri::Manager;

    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let _ = win.with_webview(|webview| unsafe {
        let wk = webview.inner() as *mut Object;
        if wk.is_null() {
            return;
        }

        // WKWebView 不绘制自身底色（KVC 私有开关，Apple 官方透明方案）
        let no: *mut Object = msg_send![class!(NSNumber), numberWithBool: 0u8];
        let _: () = msg_send![wk, setValue: no forKey: "drawsBackground"];

        // 注意：macOS 的 WKWebView 没有公开 scrollView 属性（那是 iOS API），
        // 直接发 scrollView 消息会崩溃。承载网页的 WKScrollView 是其第一个子视图。
        let subs: *mut Object = msg_send![wk, subviews];
        let sv: *mut Object = msg_send![subs, firstObject];
        if sv.is_null() {
            return;
        }
        // 滚动容器：透明背景 + 强制悬浮式滚动条（不预留白色轨道槽）
        let _: () = msg_send![sv, setDrawsBackground: 0u8];
        let clear: *mut Object = msg_send![class!(NSColor), clearColor];
        let _: () = msg_send![sv, setBackgroundColor: clear];
        // NSScrollerStyleOverlay = 1
        let _: () = msg_send![sv, setScrollerStyle: 1isize];
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance: a second launch focuses the running window instead
        // of creating a duplicate process/tray icon.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
                let _ = main.unminimize();
                let _ = main.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state
                        != tauri_plugin_global_shortcut::ShortcutState::Released
                    {
                        return;
                    }
                    // Only one shortcut is ever registered (the user's), so any
                    // release event is the toggle-hotkey.
                    let main = match app.get_webview_window("main") {
                        Some(w) => w,
                        None => return,
                    };
                    if main.is_visible().unwrap_or(false) {
                        let _ = main.hide();
                    } else {
                        let _ = main.show();
                        let _ = main.unminimize();
                        let _ = main.set_focus();
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(ShortcutState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            export_backup,
            import_backup,
            restore_backup,
            set_global_shortcut
        ])
        .setup(|app| {
            // macOS: kill the native white webview background / scrollbar track.
            #[cfg(target_os = "macos")]
            apply_macos_transparent_webview(app.handle());

            // ---- Tray menu ----
            let open_item =
                MenuItem::with_id(app, "show_main", "打开摩登待办", true, None::<&str>)?;
            let today_item = MenuItem::with_id(app, "today", "今日任务", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let tray_menu = Menu::with_items(
                app,
                &[&open_item, &today_item, &settings_item, &quit_item],
            )?;

            let default_icon = app.default_window_icon().cloned();
            let mut tray_builder = TrayIconBuilder::with_id("main")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let main = match app.get_webview_window("main") {
                        Some(w) => w,
                        None => return,
                    };
                    match event.id.as_ref() {
                        "show_main" => {
                            let _ = main.show();
                            let _ = main.unminimize();
                            let _ = main.set_focus();
                        }
                        "today" => {
                            let _ = main.show();
                            let _ = main.unminimize();
                            let _ = main.set_focus();
                            let _ = main.emit("to-today", ());
                        }
                        "settings" => {
                            let _ = main.show();
                            let _ = main.unminimize();
                            let _ = main.set_focus();
                            let _ = main.emit("open-settings", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.show();
                            let _ = main.unminimize();
                            let _ = main.set_focus();
                        }
                    }
                });

            if let Some(icon) = default_icon {
                tray_builder = tray_builder.icon(icon);
            }

            let _tray = tray_builder.build(app);

            // ---- Global shortcut ----
            // NOT registered here: the frontend applies the user's saved
            // accelerator (settings table) once the webview is ready, via the
            // set_global_shortcut command.

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
