import { useEffect, useState } from "react";
import type { Movie } from "./types";
import { Chevron, Star, ThumbUp, ThumbDown, Heart, Play } from "./Icons";
import { fetchCast, fetchTrailer, type CastMember } from "./api";
import { favorites } from "./favorites";
import { useFavorites } from "./useFavorites";
import { votes } from "./votes";
import { useVotes } from "./useVotes";
import TrailerModal from "./TrailerModal";

interface Props {
  movie: Movie | null;
  onBack: () => void;
  onStartOver: () => void;
  tabbable: boolean;
}

export default function MovieDetail({ movie, onBack, onStartOver, tabbable }: Props) {
  const [cast, setCast] = useState<CastMember[] | null>(null);
  const [castState, setCastState] = useState<"loading" | "done" | "error">("loading");
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const voted = useVotes(); // like / dislike, saved in localStorage under the "vote" key
  const favs = useFavorites();
  const isFav = !!movie && favs.some((f) => f.id === movie.id);

  useEffect(() => {
    if (!movie) return;
    let live = true;
    setCast(null);
    setCastState("loading");
    setTrailerKey(null);
    setTrailerOpen(false);
    fetchCast(movie.id)
      .then((c) => live && (setCast(c), setCastState("done")))
      .catch(() => live && setCastState("error"));
    fetchTrailer(movie.id)
      .then((k) => live && setTrailerKey(k))
      .catch(() => {});
    return () => { live = false; };
  }, [movie?.id]);

  const liked = !!movie && voted.like.some((m) => m.id === movie.id);
  const disliked = !!movie && voted.dislike.some((m) => m.id === movie.id);
  const t = tabbable ? 0 : -1;

  return (
    <>
      <header className="bar">
        <button className="back" onClick={onBack} aria-label="Back" tabIndex={t}>
          <Chevron />
        </button>
        <button className="back plain" onClick={onStartOver} tabIndex={t}>
          Start over
        </button>
      </header>
      {movie && (
        <article className="detail">
          {(movie.backdrop || movie.poster) && <img key={movie.id} className="hero" src={movie.backdrop ?? movie.poster!} alt="" />}

          <div className="actions">
            <div className="reactions" role="group" aria-label="Your reaction">
              <button className="react like" aria-pressed={liked} aria-label="Like" tabIndex={t} onClick={() => votes.toggle("like", movie)}>
                <ThumbUp filled={liked} />
              </button>
              <button className="react dislike" aria-pressed={disliked} aria-label="Dislike" tabIndex={t} onClick={() => votes.toggle("dislike", movie)}>
                <ThumbDown filled={disliked} />
              </button>
              <button
                className="react heart"
                aria-pressed={isFav}
                aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                tabIndex={t}
                onClick={() => favorites.toggle(movie)}
              >
                <Heart filled={isFav} />
              </button>
            </div>
            {trailerKey && (
              <button className="trailer" aria-label="Watch trailer" tabIndex={t} onClick={() => setTrailerOpen(true)}>
                <Play />
              </button>
            )}
          </div>

          <h2>{movie.title}</h2>
          <p className="facts">
            {movie.year} · {movie.genres.join(", ")} · <span className="score"><Star /> {movie.score.toFixed(1)}</span>
          </p>
          <p className="overview">{movie.overview || "No description available."}</p>

          <h3 className="cast-title">Cast</h3>
          {castState === "loading" && <p className="facts">Loading cast…</p>}
          {castState === "error" && <p className="facts">Cast isn't available right now.</p>}
          {castState === "done" && cast && cast.length === 0 && <p className="facts">No cast listed.</p>}
          {cast && cast.length > 0 && (
            <ul className="cast">
              {cast.map((a) => (
                <li key={a.name + a.character}>
                  <strong>{a.name}</strong>
                  {a.character && <span className="role">as {a.character}</span>}
                </li>
              ))}
            </ul>
          )}

          {trailerOpen && trailerKey && <TrailerModal videoKey={trailerKey} title={movie.title} onClose={() => setTrailerOpen(false)} />}
        </article>
      )}
    </>
  );
}
