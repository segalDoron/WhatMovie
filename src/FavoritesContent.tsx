import type { Ref } from "react";
import type { Favorite } from "./favorites";
import MovieRow from "./MovieRow";
import { favorites } from "./favorites";
import { Close } from "./Icons";

export interface FavoritesContentProps {
  items: Favorite[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onPick: (f: Favorite) => void;
  closeRef?: Ref<HTMLButtonElement>;
}

/** Header, scrollable list and loader. Shared by the mobile sheet and the desktop drawer. */
export default function FavoritesContent({ items, loading, error, onClose, onPick, closeRef }: FavoritesContentProps) {
  return (
    <>
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
              <MovieRow key={f.id} movie={f} onOpen={() => onPick(f)} onRemove={() => favorites.remove(f.id)} />
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
    </>
  );
}
