import type { ReactNode } from "react";

interface Props { open: boolean; label: string; children: ReactNode }

/** Larger screens: right-side drawer, full height. It stays open until its close button (or its top button) is used. */
export default function SideDrawer({ open, label, children }: Props) {
  return (
    <aside className={`drawer ${open ? "open" : ""}`} aria-label={label} aria-hidden={!open}>
      <div className="drawer-inner">{children}</div>
    </aside>
  );
}
