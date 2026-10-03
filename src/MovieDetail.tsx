import type { Movie } from "./types";
import { Chevron, Star } from "./Icons";

export default function MovieDetail({ movie, onBack, tabbable }: { movie: Movie | null; onBack: () => void; tabbable: boolean }) {
  return (
    <>
      <header className="bar">
        <button className="back" onClick={onBack} aria-label="Back to list" tabIndex={tabbable ? 0 : -1}>
          <Chevron />
        </button>
      </header>
      {movie && (
        <article className="detail">
          {(movie.backdrop || movie.poster) && <img className="hero" src={movie.backdrop ?? movie.poster!} alt="" />}
          <h2>{movie.title}</h2>
          <p className="facts">
            {movie.year} · {movie.genres.join(", ")} · <span className="score"><Star /> {movie.score.toFixed(1)}</span>
          </p>
          <p className="overview">{movie.overview || "No description available."}</p>
        </article>
      )}
    </>
  );
}
