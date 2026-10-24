import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./bottom-sheet.css";

interface Props { open: boolean; label: string; children: ReactNode }

// The three positions, as a share of the screen height. Keep in sync with bottom-sheet.css.
const COLLAPSED_SHARE = 0.12;
const DEFAULT_SHARE = 0.62; // where the sheet opens
const EDGE_GAP = 16; // px left above the sheet when it is fully open
const TAP_SLOP = 6; // px of finger movement that still counts as a tap
const FLICK = 0.4; // px per ms: a faster swipe moves one position by itself

type Position = 0 | 1 | 2; // 0 = collapsed, 1 = the first position, 2 = open to the top

const heights = (): [number, number, number] => [
  window.innerHeight * COLLAPSED_SHARE,
  window.innerHeight * DEFAULT_SHARE,
  window.innerHeight - EDGE_GAP,
];

interface Drag {
  id: number;
  startY: number;
  startH: number;
  moved: boolean;
  onGrip: boolean;
  lastY: number;
  lastT: number;
  speed: number; // px per ms, positive = moving up
}

/** A tap on the handle: collapsed -> first position -> top -> back to the first position. */
const afterTap = (p: Position): Position => (p === 1 ? 2 : 1);

/**
 * Mobile: bottom sheet with three positions: collapsed (12% of the screen), the first position (62%, where it opens)
 * and open to the top. Hold the top part (the handle or the title bar) and drag up or down; it follows the finger and
 * snaps to the nearest position. Tapping the handle toggles. The content (favorites, recent searches...) is passed in.
 * There is no dimmed backdrop: the page behind stays visible and scrollable. The sheet does not close on an outside tap;
 * it closes with its own close button or the menu button (both handled by the parent).
 */
export default function BottomSheet({ open, label, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<Position>(1);
  const drag = useRef<Drag | null>(null);
  const settle = useRef(0);

  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLButtonElement>(".x")?.focus();
  }, [open]);

  // Every time the sheet opens, it starts at the first position.
  useEffect(() => {
    if (!open) return;
    window.clearTimeout(settle.current);
    if (ref.current) ref.current.style.height = "";
    setPosition(1);
  }, [open]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  // Switching to the other list (favorites <-> recent searches) while the sheet is collapsed opens it to the first position,
  // the same as when it first opens. A sheet that is at the first position or at the top stays where it is.
  const previous = useRef({ label, open });
  useEffect(() => {
    const was = previous.current;
    previous.current = { label, open };
    if (open && was.open && was.label !== label && position === 0) snapTo(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, open]);

  const snapTo = (target: Position) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = ""; // back to the stylesheet's transition so the move is animated
    void el.offsetHeight;
    el.style.height = `${heights()[target]}px`;
    setPosition(target);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      el.style.height = ""; // the class takes over, same height
    }, 360);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (!t.closest(".sheet-grip, .sheet-head") || t.closest("button")) return; // buttons (like the X) stay buttons
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    window.clearTimeout(settle.current);
    const h = el.getBoundingClientRect().height;
    el.style.transition = "none";
    el.style.height = `${h}px`;
    el.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, startY: e.clientY, startH: h, moved: false, onGrip: !!t.closest(".sheet-grip"), lastY: e.clientY, lastT: e.timeStamp, speed: 0 };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const up = d.startY - e.clientY;
    if (Math.abs(up) > TAP_SLOP) d.moved = true;
    const [min, , max] = heights();
    el.style.height = `${Math.min(max, Math.max(min, d.startH + up))}px`; // follows the finger, never past the outer positions
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.speed = 0.8 * d.speed + 0.2 * ((d.lastY - e.clientY) / dt);
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    drag.current = null;
    const snaps = heights();
    const h = el.getBoundingClientRect().height;
    let target: Position;
    if (!d.moved && d.onGrip && e.type === "pointerup") {
      target = afterTap(position); // a tap on the handle toggles
    } else if (Math.abs(d.speed) > FLICK) {
      // A quick swipe moves to the next position in that direction.
      const above = snaps.findIndex((s) => s > h + 4);
      const below = snaps.map((s, i) => (s < h - 4 ? i : -1)).filter((i) => i >= 0).pop();
      target = (d.speed > 0 ? (above === -1 ? 2 : above) : (below === undefined ? 0 : below)) as Position;
    } else {
      // Otherwise the nearest position wins.
      target = snaps.reduce((best, s, i) => (Math.abs(s - h) < Math.abs(snaps[best] - h) ? i : best), 0) as Position;
    }
    snapTo(target);
  };

  const onGripKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp") setPosition((p) => Math.min(2, p + 1) as Position);
    else if (e.key === "ArrowDown") setPosition((p) => Math.max(0, p - 1) as Position);
    else if (e.key === "Enter" || e.key === " ") setPosition((p) => afterTap(p));
    else return;
    e.preventDefault();
  };

  const state = position === 0 ? "collapsed" : position === 2 ? "expanded" : "";

  // Portal + fixed positioning: the sheet floats above the page without touching its layout.
  return createPortal(
    <>
      <section
        ref={ref}
        className={`sheet ${open ? "open" : ""} ${state}`}
        role="dialog"
        aria-modal="false"
        aria-label={label}
        aria-hidden={!open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          className="sheet-grip"
          role="button"
          tabIndex={open ? 0 : -1}
          aria-label={position === 2 ? "Bring the list back down" : position === 0 ? "Open the list" : "Open the list to the top"}
          aria-expanded={position !== 0}
          onKeyDown={onGripKey}
        >
          <span />
        </div>
        {children}
      </section>
    </>,
    document.body
  );
}
