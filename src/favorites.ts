import type { Movie } from "./types";
import { users } from "./users";

export type Favorite = Pick<Movie, "id" | "title" | "genres" | "year" | "score" | "poster" | "rating">;

const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

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
  getAll: (): Favorite[] => users.getActive()?.favorites ?? [],

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

  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    if (listeners.size === 1) {
      const sub = users.subscribe(() => emit());
      return () => {
        listeners.delete(cb);
        if (!listeners.size) sub();
      };
    }
    return () => listeners.delete(cb);
  },
};
