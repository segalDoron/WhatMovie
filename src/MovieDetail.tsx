import { useEffect, useState } from "react";
import type { Movie } from "./types";
import { Chevron, Star, ThumbUp, ThumbDown, Heart, Play, Eye } from "./Icons";
import { fetchCast, fetchImages, fetchTrailer, type CastMember, type SlideImage } from "./api";
import { useUserData } from "./userData";
import TrailerModal from "./TrailerModal";
import HeroCarousel from "./HeroCarousel";
import "./watched.css";

interface Props {
  movie: Movie | null;
  open: boolean; // is the details page on screen
  onBack: () => void;
  onStartOver: () => void;
  tabbable: boolean;
}

/** 135 -> "2h 15m", 45 -> "45m", 120 -> "2h" */
function formatRuntime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
}

export default function MovieDetail({ movie, open, onBack, onStartOver, tabbable }: Props) {
  const [cast, setCast] = useState<CastMember[] | null>(null);
  const [castState, setCastState] = useState<"loading" | "done" | "error">("loading");
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [images, setImages] = useState<SlideImage[]>([]);
  const { votes, isFavorite, toggleFavorite, vote, isWatched, toggleWatched } = useUserData();
  const isFav = !!movie && isFavorite(movie.id);
  const watched = !!movie && isWatched(movie.id);

  useEffect(() => {
    if (!movie) return;
    let live = true;
    setCast(null);
    setCastState("loading");
    setTrailerKey(null);
    setTrailerOpen(false);
    setImages([]);
    fetchImages(movie.id)
      .then((list) => live && setImages(list))
      .catch(() => {});
    fetchCast(movie.id)
      .then((c) => live && (setCast(c), setCastState("done")))
      .catch(() => live && setCastState("error"));
    fetchTrailer(movie.id)
      .then((k) => live && setTrailerKey(k))
      .catch(() => {});
    return () => { live = false; };
  }, [movie?.id]);

  // Leaving the page (back, start over, browser back) also closes the trailer.
  useEffect(() => {
    if (!open) setTrailerOpen(false);
  }, [open]);

  const liked = !!movie && votes.like.some((m) => m.id === movie.id);
  const disliked = !!movie && votes.dislike.some((m) => m.id === movie.id);
  const t = tabbable ? 0 : -1;
  // Carousel: free-licensed images (with credit) from the server; until they arrive, the main image.
  const mainImage = movie?.backdrop ?? movie?.poster ?? null;
  const slides: SlideImage[] = images.length ? images : mainImage ? [{ url: mainImage }] : [];

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
          {slides.length > 0 && <HeroCarousel key={movie.id} slides={slides} tabIndex={t} />}

          <div className="actions">
            <div className="reactions" role="group" aria-label="Your reaction">
              <button className="react like" aria-pressed={liked} aria-label="Like" tabIndex={t} onClick={() => vote("like", movie)}>
                <ThumbUp filled={liked} />
              </button>
              <button className="react dislike" aria-pressed={disliked} aria-label="Dislike" tabIndex={t} onClick={() => vote("dislike", movie)}>
                <ThumbDown filled={disliked} />
              </button>
              <button
                className="react heart"
                aria-pressed={isFav}
                aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                tabIndex={t}
                onClick={() => toggleFavorite(movie)}
              >
                <Heart filled={isFav} />
              </button>
              <button
                className="react watched"
                aria-pressed={watched}
                aria-label={watched ? "Remove from watched" : "Mark as watched"}
                title={watched ? "Watched: it won't be recommended again" : "Mark as watched"}
                tabIndex={t}
                onClick={() => toggleWatched(movie)}
              >
                <Eye />
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
            {!!movie.runtime && <> · {formatRuntime(movie.runtime)}</>}
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
