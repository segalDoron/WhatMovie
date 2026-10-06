import type { RefObject } from "react";
import type { Favorite } from "./favorites";
import MovieRow from "./MovieRow";
import { favorites } from "./favorites";
import { Close } from "./Icons";

export interface FavoritesContentProps {
  closeRef?: RefObject<HTMLButtonElement | null>;
  items: Favorite[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onPick: (f: Favorite) => void;
}

/** Header, scrollable list and loader. Shared by the mobile sheet and the desktop drawer. */
export default function FavoritesContent({ items, loading, error, onClose, onPick }: FavoritesContentProps) {
  return (
    <>
      <header className="sheet-head">
        <h2>Favorites</h2>
        <button className="x" onClick={onClose} aria-label="Close favorites">
          <Close />
        </button>
      </header>

      <div className="sheet-body" aria-busy={loading}>
        {items.length === 0 ? (
          <div className="empty-state">
            <img src="/hurt.png" alt="" width="140" height="140" />
            <p>No favorites yet. Tap the heart on a movie to save it here.</p>
          </div>
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
