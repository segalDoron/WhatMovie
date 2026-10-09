import type { Movie } from "./types";
import { users } from "./users";

export type Favorite = Pick<Movie, "id" | "title" | "genres" | "year" | "score" | "poster" | "rating">;

const NONE: Favorite[] = []; // one shared empty list, so getAll() returns the same value while nothing changed

const pick = (m: Favorite): Favorite => ({
  id: m.id,
  title: m.title,
  genres: m.genres,
  year: m.year,
  score: m.score,
  poster: m.poster,
  rating: m.rating,
});

export const favorites = {
  getAll: (): Favorite[] => users.getActive()?.favorites ?? NONE,

  has: (id: number): boolean => favorites.getAll().some((m) => m.id === id),

  /** Adds the movie to favorites, or removes it if already there. Returns true when the movie now is favorited. */
  toggle(movie: Favorite): boolean {
    const active = users.getActive();
    if (!active) return false;

    if (favorites.has(movie.id)) {
      users.updateUser(active.id, { ...active, favorites: active.favorites.filter((m) => m.id !== movie.id) });
      return false;
    }

    users.updateUser(active.id, { ...active, favorites: [pick(movie), ...active.favorites] });
    return true;
  },

  // The list lives inside the active user, so any change to the users store is the signal.
  subscribe: (cb: () => void): (() => void) => users.subscribe(cb),
};