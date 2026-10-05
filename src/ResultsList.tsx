import type { Movie } from "./types";
import { Chevron } from "./Icons";
import MovieRow from "./MovieRow";
import Reel from "./Reel";

interface Props {
  movies: Movie[];
  onOpen: (m: Movie) => void;
  onStartOver: () => void;
  tabbable: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  moreMessage: string;
  onMore: () => void;
}

export default function ResultsList({ movies, onOpen, onStartOver, tabbable, hasMore, loadingMore, moreMessage, onMore }: Props) {
  const t = tabbable ? 0 : -1;
  return (
    <>
      <header className="bar">
        <button className="back" onClick={onStartOver} tabIndex={t}>
          <Chevron /> Start over
        </button>
      </header>
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
