import { useEffect, useState } from "react";
import type { Movie } from "./types";
import { Chevron, Star, ThumbUp, ThumbDown, Heart } from "./Icons";
import { fetchCast, type CastMember } from "./api";

interface Reaction { like: boolean; dislike: boolean; heart: boolean }
const NONE: Reaction = { like: false, dislike: false, heart: false };

export default function MovieDetail({ movie, onBack, tabbable }: { movie: Movie | null; onBack: () => void; tabbable: boolean }) {
  const [cast, setCast] = useState<CastMember[] | null>(null);
  const [castState, setCastState] = useState<"loading" | "done" | "error">("loading");
  const [reactions, setReactions] = useState<Record<number, Reaction>>({}); // UI only for now

  useEffect(() => {
    if (!movie) return;
    let live = true;
    setCast(null);
    setCastState("loading");
    fetchCast(movie.id)
      .then((c) => live && (setCast(c), setCastState("done")))
      .catch(() => live && setCastState("error"));
    return () => { live = false; };
  }, [movie?.id]);

  const r = (movie && reactions[movie.id]) || NONE;
  const toggle = (k: keyof Reaction) => {
    if (!movie) return;
    setReactions((all) => {
      const cur = all[movie.id] ?? NONE;
      const next = { ...cur, [k]: !cur[k] };
      if (k === "like" && next.like) next.dislike = false;
      if (k === "dislike" && next.dislike) next.like = false;
      return { ...all, [movie.id]: next };
    });
  };
  const t = tabbable ? 0 : -1;

  return (
    <>
      <header className="bar">
        <button className="back" onClick={onBack} aria-label="Back to list" tabIndex={t}>
          <Chevron />
        </button>
      </header>
      {movie && (
        <article className="detail">
          {(movie.backdrop || movie.poster) && <img className="hero" src={movie.backdrop ?? movie.poster!} alt="" />}

          <div className="reactions" role="group" aria-label="Your reaction">
            <button className="react like" aria-pressed={r.like} aria-label="Like" tabIndex={t} onClick={() => toggle("like")}>
              <ThumbUp filled={r.like} />
            </button>
            <button className="react dislike" aria-pressed={r.dislike} aria-label="Dislike" tabIndex={t} onClick={() => toggle("dislike")}>
              <ThumbDown filled={r.dislike} />
            </button>
            <button className="react heart" aria-pressed={r.heart} aria-label="Love" tabIndex={t} onClick={() => toggle("heart")}>
              <Heart filled={r.heart} />
            </button>
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
        </article>
      )}
    </>
  );
}
