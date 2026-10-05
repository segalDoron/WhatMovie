import type { Favorite } from "./favorites";
import { Heart, Star } from "./Icons";

interface Props {
  movie: Favorite & { providers?: string[] };
  onOpen: () => void;
  onRemove?: () => void; // favorites list only: heart in the top right corner
  tabIndex?: number;
}

export default function MovieRow({ movie, onOpen, onRemove, tabIndex }: Props) {
  return (
    <li className={onRemove ? "has-remove" : undefined}>
      <button className="item" onClick={onOpen} tabIndex={tabIndex}>
        {movie.poster ? <img src={movie.poster} alt="" loading="lazy" /> : <div className="noimg" />}
        <div className="meta">
          <h2>{movie.title}</h2>
          <p className="genre">{movie.genres.slice(0, 3).join(", ")}</p>
          <p className="year">
            {movie.year}
            {movie.rating && <span className="cert" aria-label={`Rated ${movie.rating}`}>{movie.rating}</span>}
          </p>
          <p className="score"><Star /> {movie.score.toFixed(1)}</p>
          {!!movie.providers?.length && (
            <p className="providers" aria-label={`Streaming on ${movie.providers.join(", ")}`}>
              {movie.providers.slice(0, 3).map((n) => <span key={n} className="tag">{n}</span>)}
              {movie.providers.length > 3 && <span className="tag">+{movie.providers.length - 3}</span>}
            </p>
          )}
        </div>
      </button>
      {onRemove && (
        <button className="remove" onClick={onRemove} aria-label={`Remove ${movie.title} from favorites`} tabIndex={tabIndex}>
          <Heart filled />
        </button>
      )}
    </li>
  );
}
