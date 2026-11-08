import type { Favorite } from "./userData";
import { useUserData } from "./userData";
import { Eye, Heart, ThumbDown, ThumbUp } from "./Icons";
import "./card-actions.css";

interface Props {
  movie: Favorite;
  tabIndex?: number;
  activeOnly?: boolean; // drawer lists: only the statuses that are on
}

/**
 * Like / favorite / dislike / watched toggles, in that order.
 * Results cards: all four together in the top-right corner (2x2 on mobile, one row on desktop).
 * Drawer lists: only the active ones, same look on mobile and desktop.
 */
export default function MovieCardActions({ movie, tabIndex, activeOnly }: Props) {
  const { votes, isFavorite, isWatched, vote, toggleFavorite, toggleWatched } = useUserData();
  const liked = votes.like.some((m) => m.id === movie.id);
  const disliked = votes.dislike.some((m) => m.id === movie.id);
  const fav = isFavorite(movie.id);
  const watched = isWatched(movie.id);
  const show = (on: boolean) => !activeOnly || on;

  return (
    <div className={`card-actions${activeOnly ? " active-only" : ""}`} role="group" aria-label={`Your status for ${movie.title}`}>
      {show(liked) && (
        <button type="button" className="card-act like" aria-pressed={liked} aria-label={`Like ${movie.title}`} tabIndex={tabIndex} onClick={() => vote("like", movie)}>
          <ThumbUp filled={liked} />
        </button>
      )}
      {show(fav) && (
        <button type="button" className="card-act heart" aria-pressed={fav} aria-label={`${fav ? "Remove" : "Add"} ${movie.title} ${fav ? "from" : "to"} favorites`} tabIndex={tabIndex} onClick={() => toggleFavorite(movie)}>
          <Heart filled={fav} />
        </button>
      )}
      {show(disliked) && (
        <button type="button" className="card-act dislike" aria-pressed={disliked} aria-label={`Dislike ${movie.title}`} tabIndex={tabIndex} onClick={() => vote("dislike", movie)}>
          <ThumbDown filled={disliked} />
        </button>
      )}
      {show(watched) && (
        <button type="button" className="card-act watched" aria-pressed={watched} aria-label={`Mark ${movie.title} ${watched ? "unwatched" : "watched"}`} tabIndex={tabIndex} onClick={() => toggleWatched(movie)}>
          <Eye />
        </button>
      )}
    </div>
  );
}