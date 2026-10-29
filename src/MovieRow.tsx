import type { Favorite } from "./userData";
import { Heart, Star } from "./Icons";
import "./result-favorite.css";

interface Props {
  movie: Favorite & { providers?: string[]; runtime?: number };
  onOpen: () => void;
  onRemove?: () => void; // favorites list only: heart in the top right corner
  favorite?: boolean; // results list only: marks a favorite with a heart and shows its length
  tabIndex?: number;
}

function formatRuntime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

export default function MovieRow({ movie, onOpen, onRemove, favorite, tabIndex }: Props) {
  const showFav = !onRemove && !!favorite;
  return (
    <li className={onRemove ? "has-remove" : showFav ? "is-favorite" : undefined}>
      <button className="item" onClick={onOpen} tabIndex={tabIndex}>
        {movie.poster ? <img src={movie.poster} alt="" loading="lazy" /> : <div className="noimg" />}
        <div className="meta">
          <h2>{movie.title}</h2>
          <p className="genre">{movie.genres.slice(0, 3).join(", ")}</p>
          <p className="year">
            {movie.year}
            {movie.rating && <span className="cert" aria-label={`Rated ${movie.rating}`}>{movie.rating}</span>}
          </p>
          {showFav && !!movie.runtime && <p className="runtime">{formatRuntime(movie.runtime)}</p>}
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
      {showFav && (
        <span className="fav-mark" role="img" aria-label="Favorite">
          <Heart filled />
        </span>
      )}
    </li>
  );
}
