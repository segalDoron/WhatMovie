import type { Movie } from "./types";
import { Chevron, Star } from "./Icons";

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
            <li key={m.id}>
              <button className="item" onClick={() => onOpen(m)} tabIndex={t}>
                {m.poster ? <img src={m.poster} alt="" loading="lazy" /> : <div className="noimg" />}
                <div className="meta">
                  <h2>{m.title}</h2>
                  <p className="genre">{m.genres.slice(0, 3).join(", ")}</p>
                  <p className="year">{m.year}</p>
                  <p className="score"><Star /> {m.score.toFixed(1)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
