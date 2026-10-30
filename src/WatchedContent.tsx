import type { Favorite } from "./userData";
import MovieRow from "./MovieRow";
import { Close, Eye } from "./Icons";
import { WATCHED_GOAL, watchedProgress } from "./watchlist";

export interface WatchedContentProps {
  items: Favorite[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onPick: (m: Favorite) => void;
}

/** Watched progress, then the watched movies. Shown in the mobile sheet and the desktop drawer. */
export default function WatchedContent({ items, loading, error, onClose, onPick }: WatchedContentProps) {
  const pct = Math.round(watchedProgress(items.length) * 100);
  return (
    <>
      <header className="sheet-head">
        <h2>Watched</h2>
        <button className="x" onClick={onClose} aria-label="Close watched">
          <Close />
        </button>
      </header>

      <div className="sheet-body" aria-busy={loading}>
        <div className="watch-progress">
          <div className="watch-progress-text">
            <span>{items.length} of {WATCHED_GOAL} watched</span>
            <span>{pct}%</span>
          </div>
          <div className="watch-bar" role="progressbar" aria-label="Watched progress" aria-valuemin={0} aria-valuemax={WATCHED_GOAL} aria-valuenow={Math.min(items.length, WATCHED_GOAL)}>
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <span className="watch-empty-icon"><Eye /></span>
            <p>Movies you mark as watched show up here. Watched movies are never recommended again.</p>
          </div>
        ) : (
          <ul className="list">
            {items.map((m) => (
              <MovieRow key={m.id} movie={m} onOpen={() => onPick(m)} />
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
