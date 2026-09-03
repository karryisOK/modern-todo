# 摩登待办

摩登待办（DayPin）是一款可以长期放在桌面上的轻量每日任务小组件（Windows / macOS），基于 Tauri 2 + React 19 + SQLite 构建。

**完全本地：任务数据只保存在你自己的电脑上，不上传服务器，不需要账号，不依赖任何云同步，运行时没有任何网络请求。**

## 主要功能

- **每日任务**：新增 / 编辑 / 删除任务，三态流转（todo → doing → done），SQLite 持久化
- **日期导航**：前一天 / 后一天 / 回到今天，日期选择器（年月快捷选择）
- **日历视图**：按月查看每天的任务完成情况
- **历史记录**：task_history 自动记录创建、状态变更、日期变更、删除等事件
- **逾期提示**：昨天未完成的任务自动标记逾期
- **顺延（Carry Over）**：一键把昨天未完成任务移到今天（done 不迁移，且不会重复迁移）
- **拖拽排序**：任务可拖拽排序，重启后顺序保持
- **桌面集成**：
  - 窗口置顶（📌 按钮，持久化）
  - 系统托盘（关闭窗口隐藏到托盘而非退出）
  - 全局快捷键 `Ctrl + Shift + Space`（macOS 为 `⌘⇧Space`）显示 / 隐藏
  - 窗口位置记忆（含多显示器安全）
  - 开机自动启动（可开关）
- **主题**：浅色 / 深色 / 跟随系统
- **本地备份**：导出 / 导入 JSON 备份（详见下文）

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2（Rust） |
| 前端 | React 19 + TypeScript + Zustand |
| 构建 | Vite 7 |
| 数据库 | SQLite（tauri-plugin-sql / sqlx） |

## 开发环境要求

- Node.js ≥ 18
- Rust（rustup，含 MSVC 工具链）
- Windows：WebView2（Win10/11 自带）；macOS：Xcode Command Line Tools

## 安装依赖

```bash
npm install
```

## 开发启动

```bash
npm run tauri dev
```

## 正式构建

```bash
# Windows（生成 NSIS 安装包）
npm run tauri build
# 产物：src-tauri/target/release/bundle/nsis/摩登待办_1.0.0_x64-setup.exe

# macOS（生成 .app 与 .dmg，需在 macOS 机器上执行）
npm run tauri build
# 产物：src-tauri/target/release/bundle/dmg/ 与 bundle/macos/
```

> macOS 构建必须在 macOS 机器上进行（Apple Silicon 与 Intel 分别构建，或使用 `--target universal-apple-darwin` 构建 Universal 版）。Windows 无法交叉构建 macOS 包，反之亦然。

未签名说明：Windows 未签名安装包首次运行可能出现 SmartScreen 提示；macOS 未签名 / 未公证应用可能被 Gatekeeper 拦截。个人本地使用可自行确认后放行，请勿使用不安全方式绕过系统安全机制。

## 数据备份

### 导出

设置 → 数据 → **导出备份** → 选择保存位置。默认文件名 `DayPin_Backup_YYYY-MM-DD.json`。

### 导入

设置 → 数据 → **导入备份** → 选择 `.json` 备份文件 → 系统校验通过后弹出二次确认 → 确认后事务化恢复（全部成功才提交，任何一步失败自动回滚，不会出现恢复一半的情况）。恢复完成后应用自动重新加载。

### 备份格式

```json
{
  "app": "摩登待办",
  "backupVersion": 1,
  "exportedAt": "2026-09-02T00:00:00.000Z",
  "tasks": [],
  "taskHistory": [],
  "settings": {}
}
```

- 恢复策略为**整库替换**（不是合并），当前任务、历史、设置会被备份内容覆盖
- 非法文件（非 JSON、非摩登待办备份、版本不兼容、字段损坏）会被拒绝且不影响现有数据；改名前导出的 DayPin 备份仍可导入
- `backupVersion` 用于未来格式升级判断

## 数据位置

摩登待办使用 Tauri 的应用配置目录（`app_config_dir`，以 Bundle Identifier `com.daypin.app` 命名）存放 SQLite 数据库：

| 平台 | 路径 |
|---|---|
| Windows | `%APPDATA%\com.daypin.app\daypin.db`（即 `C:\Users\<你>\AppData\Roaming\com.daypin.app\`） |
| macOS | `~/Library/Application Support/com.daypin.app/daypin.db` |

### 如何备份

- 推荐方式：应用内 设置 → 数据 → 导出备份（生成的 JSON 可跨设备恢复）
- 也可以直接复制上述目录中的 `daypin.db` 文件（复制前请先从托盘退出应用，避免文件被占用）

卸载说明：Windows NSIS 安装包卸载时**不会删除**应用数据目录，任务数据默认保留；如需彻底清除请手动删除上表目录。

## 常见问题

- **点 ✕ 窗口不见了？** 关闭是"隐藏到托盘"，双击托盘图标或按 `Ctrl + Shift + Space` 重新显示；彻底退出请使用托盘右键菜单的"退出"。
- **窗口拖不动？** 顶栏空白区域（非按钮处）按住拖动即可，卡片四周留白处也可拖动。
- **快捷键无效？** 请确认应用正在运行（托盘有图标）；部分系统快捷键可能被其他应用占用。
- **恢复备份后界面数据没变？** 正常情况下恢复后会自动刷新；若未刷新，请从托盘退出后重新打开。
