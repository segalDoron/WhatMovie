import { useEffect, useRef } from "react";
import type { Favorite } from "./favorites";
import MovieRow from "./MovieRow";
import { Close } from "./Icons";

interface Props {
  open: boolean;
  items: Favorite[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onPick: (f: Favorite) => void;
}

export default function FavoritesSheet({ open, items, loading, error, onClose, onPick }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`backdrop ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <section className={`sheet ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="Favorites" aria-hidden={!open}>
        <header className="sheet-head">
          <h2>Favorites</h2>
          <button ref={closeRef} className="x" onClick={onClose} aria-label="Close favorites">
            <Close />
          </button>
        </header>

        <div className="sheet-body" aria-busy={loading}>
          {items.length === 0 ? (
            <p className="empty">No favorites yet. Tap the heart on a movie to save it here.</p>
          ) : (
            <ul className="list">
              {items.map((f) => (
                <MovieRow key={f.id} movie={f} onOpen={() => onPick(f)} />
              ))}
            </ul>
          )}
          {error && <p className="empty err" role="alert">{error}</p>}
        </div>

        {loading && (
          <div className="sheet-loading" role="status">
            <div className="spinner" />
            <p>Loading movie…</p>
          </div>
        )}
      </section>
    </>
  );
}
