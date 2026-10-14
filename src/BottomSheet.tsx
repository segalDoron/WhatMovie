import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./bottom-sheet.css";

interface Props { open: boolean; label: string; onClose: () => void; children: ReactNode }

const DEFAULT_SHARE = 0.7; // the sheet opens at 70% of the screen height
const EDGE_GAP = 16; // px left above the sheet when it is fully open
const TAP_SLOP = 6; // px of finger movement that still counts as a tap
const FLICK = 0.4; // px per ms: a faster swipe decides the direction by itself

const bounds = () => ({ min: window.innerHeight * DEFAULT_SHARE, max: window.innerHeight - EDGE_GAP });

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

/**
 * Mobile: bottom sheet. It opens at 70% of the screen height. Hold the top part (the handle or the title bar) and drag
 * up to open it to the top, or drag down to bring it back. Tapping the handle toggles the same two positions.
 * The content (favorites, recent searches...) is passed in.
 */
export default function BottomSheet({ open, label, onClose, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<Drag | null>(null);
  const settle = useRef(0);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>(".x")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Every time the sheet opens, it starts at the first position.
  useEffect(() => {
    if (!open) return;
    window.clearTimeout(settle.current);
    if (ref.current) ref.current.style.height = "";
    setExpanded(false);
  }, [open]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const snapTo = (target: boolean) => {
    const el = ref.current;
    if (!el) return;
    const { min, max } = bounds();
    el.style.transition = ""; // back to the stylesheet's transition so the move is animated
    void el.offsetHeight;
    el.style.height = `${target ? max : min}px`;
    setExpanded(target);
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
    const { min, max } = bounds();
    el.style.height = `${Math.min(max, Math.max(min, d.startH + up))}px`; // follows the finger, never past the two positions
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
    const { min, max } = bounds();
    const h = el.getBoundingClientRect().height;
    let target: boolean;
    if (!d.moved && d.onGrip && e.type === "pointerup") target = !expanded; // a tap on the handle toggles
    else if (Math.abs(d.speed) > FLICK) target = d.speed > 0; // a quick swipe decides the direction
    else target = h > (min + max) / 2; // otherwise the nearer position wins
    snapTo(target);
  };

  const onGripKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (e.key === "ArrowUp") setExpanded(true);
      else if (e.key === "ArrowDown") setExpanded(false);
      else setExpanded((v) => !v);
    }
  };

  // Portal + fixed positioning: the sheet floats above the page without touching its layout.
  return createPortal(
    <>
      <div className={`backdrop ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <section
        ref={ref}
        className={`sheet ${open ? "open" : ""} ${expanded ? "expanded" : ""}`}
        role="dialog"
        aria-modal="true"
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
          aria-label={expanded ? "Bring the list back down" : "Open the list to the top"}
          aria-expanded={expanded}
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