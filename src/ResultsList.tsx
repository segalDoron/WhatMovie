import type { Movie } from "./types";
import { Chevron, Sort } from "./Icons";
import MovieRow from "./MovieRow";
import Reel from "./Reel";
import type { Insight } from "./useInsight";
import "./insight.css";

interface Props {
  movies: Movie[];
  onOpen: (m: Movie) => void;
  onStartOver: () => void;
  tabbable: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  moreMessage: string;
  onMore: () => void;
  sorted: boolean;
  onToggleSort: () => void;
  insight?: Insight | null; // the AI take, only passed when the user has their own key
}

export default function ResultsList({ movies, onOpen, onStartOver, tabbable, hasMore, loadingMore, moreMessage, onMore, sorted, onToggleSort, insight }: Props) {
  const t = tabbable ? 0 : -1;
  return (
    <>
      <header className="bar">
        <button className="back" onClick={onStartOver} tabIndex={t}>
          <Chevron /> Start over
        </button>
      </header>
      {insight && (
        <div className="insight-wrap">
          <aside className="insight" aria-live="polite">
            <span className="insight-label">AI take</span>
            {insight.state === "loading" ? <span className="insight-wait">Thinking…</span> : <p>{insight.text}</p>}
          </aside>
        </div>
      )}
      {movies.length > 1 && (
        <div className="list-tools">
          <button className="sort" aria-pressed={sorted} onClick={onToggleSort} tabIndex={t}>
            <Sort /> Sort by rating
          </button>
        </div>
      )}
      {movies.length === 0 ? (
        <p className="empty">No matches. Try loosening a filter or start over.</p>
      ) : (
        <ul className="list">
          {movies.map((m) => (
            <MovieRow key={m.id} movie={m} onOpen={() => onOpen(m)} tabIndex={t} />
          ))}
        </ul>
      )}

      <div className="more-row" aria-live="polite">
        {loadingMore ? (
          <div className="more-loading" role="status" aria-label="Loading more movies">
            <Reel size={56} />
          </div>
        ) : (
          hasMore && (
            <button className="link more-link" onClick={onMore} tabIndex={t}>
              Show more
            </button>
          )
        )}
        {moreMessage && <p className="more-msg">{moreMessage}</p>}
      </div>
    </>
  );
}
