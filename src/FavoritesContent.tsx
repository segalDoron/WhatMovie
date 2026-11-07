import type { RefObject } from "react";
import type { Favorite } from "./userData";
import MovieRow from "./MovieRow";
import { Close } from "./Icons";
import { useAnimatedList } from "./useAnimatedList";

export interface FavoritesContentProps {
  items: Favorite[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onPick: (f: Favorite) => void;
  closeRef?: RefObject<HTMLButtonElement>;
}

/** Header, scrollable list and loader. Shared by the mobile sheet and the desktop drawer. */
export default function FavoritesContent({ items, loading, error, onClose, onPick, closeRef }: FavoritesContentProps) {
  const rows = useAnimatedList(items, (f) => f.id);
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
          <div className="empty-state">
            <img src="/hurt.png" alt="" width="140" height="140" />
            <p>No favorites yet. Tap the heart on a movie to save it here.</p>
          </div>
        ) : (
          <ul className="list">
            {rows.map((r) => (
              <MovieRow key={r.key} movie={r.item} anim={r.anim} onOpen={() => onPick(r.item)} />
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