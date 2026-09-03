// Global-shortcut helpers shared by the Settings page and the settings store.

/** Canonical default accelerator (Rust parser is case-insensitive). */
export const DEFAULT_ACCEL = "ctrl+shift+space";

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/**
 * Convert a KeyboardEvent into a Rust-parseable accelerator string like
 * "ctrl+shift+j". Returns:
 *  - { waiting: true }            → only modifiers pressed so far
 *  - { waiting: false, ok: true } → valid combo (includes ctrl/alt/super)
 *  - { waiting: false, ok: false, reason } → reject with hint
 */
export function eventToAccel(e: KeyboardEvent): {
  waiting: boolean;
  ok?: boolean;
  accel?: string;
  reason?: string;
} {
  if (MODIFIER_CODES.has(e.code)) {
    return { waiting: true };
  }

  // Rust/global-hotkey parser accepts any case; canonical form is lowercase
  // modifier tokens + UPPERCASED key token (e.g. "ctrl+shift+SPACE").
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("ctrl");
  if (e.shiftKey) mods.push("shift");
  if (e.altKey) mods.push("alt");
  if (e.metaKey) mods.push("super");

  const key = e.code.toUpperCase();
  const accel = [...mods, key].join("+");

  // Require at least one "real" modifier — bare keys would hijack normal typing.
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    return {
      waiting: false,
      ok: false,
      reason: "快捷键需要包含 Ctrl、Alt 或 Win 至少一个修饰键",
    };
  }

  return { waiting: false, ok: true, accel };
}

/** "ctrl+shift+space" → "Ctrl + Shift + Space" for display. */
export function formatAccel(accel: string): string {
  return accel
    .split("+")
    .map((token) => {
      const t = token.trim();
      switch (t.toLowerCase()) {
        case "ctrl":
        case "control":
          return "Ctrl";
        case "shift":
          return "Shift";
        case "alt":
        case "option":
          return "Alt";
        case "super":
        case "meta":
        case "cmd":
        case "command":
          return "Win";
        default:
          // "SPACE" → "Space", "J" → "J", "F2" → "F2", "DIGIT5" → "5"
          if (/^DIGIT.$/.test(t)) return t.slice(5);
          if (/^KEY.$/.test(t)) return t.slice(3);
          return t.charAt(0) + t.slice(1).toLowerCase();
      }
    })
    .join(" + ");
}
