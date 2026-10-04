import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import FavoritesContent, { type FavoritesContentProps } from "./FavoritesContent";

interface Props extends Omit<FavoritesContentProps, "closeRef"> {
  open: boolean;
}

/** Mobile: bottom sheet, 70% of the screen height. */
export default function FavoritesSheet({ open, ...content }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { onClose } = content;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Portal + fixed positioning: the sheet floats above the page without touching its layout.
  return createPortal(
    <>
      <div className={`backdrop ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <section className={`sheet ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="Favorites" aria-hidden={!open}>
        <FavoritesContent {...content} closeRef={closeRef} />
      </section>
    </>,
    document.body
  );
}
