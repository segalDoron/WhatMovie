import type { Movie } from "./types";
import { Chevron } from "./Icons";
import MovieRow from "./MovieRow";

interface Props {
  movies: Movie[];
  onOpen: (m: Movie) => void;
  onStartOver: () => void;
  tabbable: boolean;
}

export default function ResultsList({ movies, onOpen, onStartOver, tabbable }: Props) {
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
    </>
  );
}
