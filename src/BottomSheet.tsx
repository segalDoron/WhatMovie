import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props { open: boolean; label: string; onClose: () => void; children: ReactNode }

/** Mobile: bottom sheet, 70% of the screen height. The content (favorites, recent searches...) is passed in. */
export default function BottomSheet({ open, label, onClose, children }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>(".x")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Portal + fixed positioning: the sheet floats above the page without touching its layout.
  return createPortal(
    <>
      <div className={`backdrop ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <section ref={ref} className={`sheet ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open}>
        {children}
      </section>
    </>,
    document.body
  );
}
