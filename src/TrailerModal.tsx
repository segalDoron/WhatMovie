import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Close } from "./Icons";

interface Props { videoKey: string; title: string; onClose: () => void }

/** A window in the middle of the page (not full screen) that plays the YouTube trailer. */
export default function TrailerModal({ videoKey, title, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`${title} trailer`} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button ref={closeRef} className="x" onClick={onClose} aria-label="Close trailer">
            <Close />
          </button>
        </header>
        <div className="video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
