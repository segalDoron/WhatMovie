import { useEffect, useRef, type ReactNode } from "react";

interface Props { open: boolean; label: string; onClose: () => void; children: ReactNode }

/**
 * Larger screens: right-side drawer, full height. Non-modal dialog:
 * focus moves into it when it opens and returns to the button that opened it when it closes;
 * Escape closes it. The page behind stays usable. Closed, it is hidden and cannot be reached by keyboard.
 */
export default function SideDrawer({ open, label, onClose, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A modal dialog on top (login, account) handles its own Escape.
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  return (
    <aside
      ref={ref}
      className={`drawer ${open ? "open" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      aria-hidden={!open}
      tabIndex={-1}
    >
      <div className="drawer-inner">{children}</div>
    </aside>
  );
}
