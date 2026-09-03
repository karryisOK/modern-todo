import { useEffect, useRef, useState } from "react";
import { useTaskStore } from "../stores/taskStore";
import { TaskItem } from "./TaskItem";
import styles from "./TaskList.module.css";

const DRAG_THRESHOLD = 5; // px — must move at least this far to enter drag mode
const GLIDE_MS = 170; // sibling rows glide duration (matches CSS)

interface RowLayout {
  id: number;
  top: number; // layout offset from list top (measured pre-drag, transform-free)
  h: number;
}

export function TaskList() {
  const tasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const error = useTaskStore((s) => s.error);
  const reorderTasks = useTaskStore((s) => s.reorderTasks);

  // Order mirrors the store order; it is NOT mutated during drag — rows move
  // via transforms (smooth), and the DOM is reordered once on drop.
  const [order, setOrder] = useState<number[]>([]);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // "Pending" drag state — pointerdown received, click vs drag undecided.
  const pendingRef = useRef<{ id: number; startX: number; startY: number; pointerId: number } | null>(null);
  const didDragRef = useRef(false);

  // Drag geometry (frozen at drag start so transforms never pollute metrics).
  const layoutRef = useRef<RowLayout[]>([]);
  const gapRef = useRef(8);
  const startClientYRef = useRef(0);
  const origIdxRef = useRef(-1);
  const targetIdxRef = useRef(-1);
  const dyRef = useRef(0);
  const draggingIdRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  // Sync order whenever the task list changes (new day, reload, etc.).
  useEffect(() => {
    setOrder(tasks.map((t) => t.id));
  }, [tasks]);

  // Cleanup pending settle timer on unmount.
  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    },
    []
  );

  if (error) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>出错了</p>
        <p className={styles.emptyHint}>{error}</p>
      </div>
    );
  }

  if (loading) {
    return <div className={styles.empty}>加载中…</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>还没有任务</p>
        <p className={styles.emptyHint}>在下方添加第一个任务</p>
      </div>
    );
  }

  function onPointerDown(e: React.PointerEvent, id: number) {
    // Only start potential drag on primary button, ignore interactive children.
    if (e.button !== 0) return;
    if (draggingIdRef.current !== null) return; // settle in progress
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select")) return;

    const idx = order.indexOf(id);
    if (idx === -1) return;

    pendingRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
    didDragRef.current = false;

    // Capture early so we track movement even if cursor leaves the row.
    const row = rowRefs.current.get(id);
    row?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    // Case 1: active drag → follow the pointer.
    if (draggingIdRef.current !== null) {
      handleDragMove(e.clientY);
      return;
    }

    // Case 2: pending — check if cursor moved past the threshold.
    const pending = pendingRef.current;
    if (!pending || pending.pointerId !== e.pointerId) return;

    const dx = e.clientX - pending.startX;
    const dy = e.clientY - pending.startY;
    if (Math.abs(dy) < DRAG_THRESHOLD && Math.abs(dx) < DRAG_THRESHOLD) return;

    beginDrag(pending.id, e.clientY);
  }

  /** Freeze layout metrics, lift the dragged row, enable sibling glide. */
  function beginDrag(id: number, clientY: number) {
    const listEl = listRef.current;
    if (!listEl) return;
    const listRect = listEl.getBoundingClientRect();

    const layout: RowLayout[] = order.map((rid) => {
      const el = rowRefs.current.get(rid);
      const r = el!.getBoundingClientRect();
      return { id: rid, top: r.top - listRect.top, h: r.height };
    });
    layoutRef.current = layout;
    gapRef.current =
      layout.length > 1
        ? Math.max(0, layout[1].top - (layout[0].top + layout[0].h))
        : 8;

    draggingIdRef.current = id;
    didDragRef.current = true;
    startClientYRef.current = clientY;
    origIdxRef.current = layout.findIndex((x) => x.id === id);
    targetIdxRef.current = origIdxRef.current;
    dyRef.current = 0;
    setDraggingId(id);

    // Dragged row follows the pointer 1:1 (no transform transition);
    // siblings glide via CSS transform transition.
    for (const { id: rid } of layout) {
      const el = rowRefs.current.get(rid);
      if (!el) continue;
      if (rid === id) {
        el.style.transition = "box-shadow 0.15s ease, background 0.15s ease";
        el.style.zIndex = "10";
      } else {
        el.style.transition = `transform ${GLIDE_MS}ms ease`;
      }
    }
  }

  function handleDragMove(clientY: number) {
    const id = draggingIdRef.current;
    if (id === null) return;
    const el = rowRefs.current.get(id);
    const layout = layoutRef.current;
    const origIdx = origIdxRef.current;
    if (!el || layout.length === 0) return;

    const dragged = layout[origIdx];
    const listEl = listRef.current!;

    let dy = clientY - startClientYRef.current;
    // Keep the dragged row inside the list bounds.
    const listH = listEl.getBoundingClientRect().height;
    dy = Math.max(-dragged.top, Math.min(dy, listH - dragged.top - dragged.h));
    dyRef.current = dy;
    el.style.transform = `translateY(${dy}px)`;

    // Insertion index = how many sibling midpoints the dragged center passed.
    const center = dragged.top + dragged.h / 2 + dy;
    let target = 0;
    for (let i = 0; i < layout.length; i++) {
      if (i === origIdx) continue;
      if (center > layout[i].top + layout[i].h / 2) target++;
    }

    if (target !== targetIdxRef.current) {
      targetIdxRef.current = target;
      const slot = dragged.h + gapRef.current;
      for (let i = 0; i < layout.length; i++) {
        if (i === origIdx) continue;
        const row = rowRefs.current.get(layout[i].id);
        if (!row) continue;
        let shift = 0;
        if (origIdx < target && i > origIdx && i <= target) shift = -slot;
        else if (target < origIdx && i >= target && i < origIdx) shift = slot;
        row.style.transform = shift !== 0 ? `translateY(${shift}px)` : "";
      }
    }
  }

  function onPointerUp(_e: React.PointerEvent) {
    const id = draggingIdRef.current;

    if (id === null) {
      // Pure click — just clear pending state.
      pendingRef.current = null;
      didDragRef.current = false;
      return;
    }

    // ---- Settle: glide the dragged row into its final slot, then commit ----
    const layout = layoutRef.current;
    const origIdx = origIdxRef.current;
    const target = targetIdxRef.current;
    const dragged = layout[origIdx];
    // target counts sibling midpoints above the dragged center — that IS the
    // dragged row's final index (no adjustment; siblings exclude the dragged).
    const finalIdx = target;
    const settleDy = layout[finalIdx].top - dragged.top;

    const draggedEl = rowRefs.current.get(id);
    if (draggedEl && Math.abs(settleDy - dyRef.current) > 2) {
      draggedEl.style.transition = `transform ${GLIDE_MS}ms ease`;
      draggedEl.style.transform = `translateY(${settleDy}px)`;
    }

    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      // Clear all inline drag styles.
      for (const { id: rid } of layout) {
        const el = rowRefs.current.get(rid);
        if (el) {
          el.style.transition = "";
          el.style.transform = "";
          el.style.zIndex = "";
        }
      }
      if (draggingIdRef.current === id) {
        draggingIdRef.current = null;
        setDraggingId(null);
      }
      // Commit final order — single DOM reorder after the animation.
      const finalOrder = layout.map((x) => x.id);
      const [moved] = finalOrder.splice(origIdx, 1);
      finalOrder.splice(finalIdx, 0, moved);
      const original = tasks.map((t) => t.id);
      if (finalOrder.some((v, i) => v !== original[i])) {
        void reorderTasks(finalOrder);
      }
    }, GLIDE_MS + 30);

    pendingRef.current = null;
    didDragRef.current = false;
  }

  // Also clear pending when pointer leaves the list mid-press (not yet dragging).
  function onPointerLeaveList() {
    if (pendingRef.current && draggingIdRef.current === null) {
      pendingRef.current = null;
    }
  }

  return (
    <div
      className={styles.list}
      ref={listRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeaveList}
    >
      {order.map((id) => {
        const task = tasks.find((t) => t.id === id);
        if (!task) return null;
        const isDragging = draggingId === id;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) rowRefs.current.set(id, el);
              else rowRefs.current.delete(id);
            }}
            className={`${styles.dragWrapper} ${isDragging ? styles.dragging : ""}`}
            onPointerDown={(e) => onPointerDown(e, id)}
            title="按住拖动排序"
          >
            <TaskItem task={task} />
          </div>
        );
      })}
    </div>
  );
}
