import type { Favorite } from "./favorites";
import { Star } from "./Icons";

interface Props { movie: Favorite; onOpen: () => void; tabIndex?: number }

export default function MovieRow({ movie, onOpen, tabIndex }: Props) {
  return (
    <li>
      <button className="item" onClick={onOpen} tabIndex={tabIndex}>
        {movie.poster ? <img src={movie.poster} alt="" loading="lazy" /> : <div className="noimg" />}
        <div className="meta">
          <h2>{movie.title}</h2>
          <p className="genre">{movie.genres.slice(0, 3).join(", ")}</p>
          <p className="year">{movie.year}</p>
          <p className="score"><Star /> {movie.score.toFixed(1)}</p>
        </div>
      </button>
    </li>
  );
}
