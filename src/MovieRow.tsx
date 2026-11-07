import type { Favorite } from "./userData";
import { Star } from "./Icons";
import MovieCardActions from "./MovieCardActions";
import "./result-favorite.css";
import "./list-motion.css";
import type { RowAnim } from "./useAnimatedList";

interface Props {
  movie: Favorite & { providers?: string[]; runtime?: number };
  onOpen: () => void;
  tabIndex?: number;
  actionsActiveOnly?: boolean; // drawer lists: only the active statuses
  anim?: RowAnim; // drawer lists: row is being added ("enter") or removed ("leave")
}

function formatRuntime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

export default function MovieRow({ movie, onOpen, tabIndex, anim, actionsActiveOnly }: Props) {
  const cls = anim ? `row-anim row-${anim}` : "";
  // A row that is leaving is gone for keyboard and screen readers right away.
  const leaving: Record<string, string> = anim === "leave" ? { inert: "", "aria-hidden": "true" } : {};
  return (
    <li className={cls || undefined} {...leaving}>
      <div className="row-clip">
      <button className="item" onClick={onOpen} tabIndex={tabIndex}>
        {movie.poster ? <img src={movie.poster} alt="" loading="lazy" /> : <div className="noimg" />}
        <div className="meta">
          <h2>{movie.title}</h2>
          <p className="genre">{movie.genres.slice(0, 3).join(", ")}</p>
          <p className="year">
            {movie.year}
            {movie.rating && <span className="cert" aria-label={`Rated ${movie.rating}`}>{movie.rating}</span>}
          </p>
          {!!movie.runtime && <p className="runtime">{formatRuntime(movie.runtime)}</p>}
          <p className="score"><Star /> {movie.score.toFixed(1)}</p>
          {!!movie.providers?.length && (
            <p className="providers" aria-label={`Streaming on ${movie.providers.join(", ")}`}>
              {movie.providers.slice(0, 3).map((n) => <span key={n} className="tag">{n}</span>)}
              {movie.providers.length > 3 && <span className="tag">+{movie.providers.length - 3}</span>}
            </p>
          )}
        </div>
      </button>
        <MovieCardActions movie={movie} tabIndex={tabIndex} activeOnly={actionsActiveOnly} />
      </div>
    </li>
  );
}