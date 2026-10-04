import type { Movie } from "./types";

/** Lightweight record kept in localStorage. Full details are fetched from TMDB when a favorite is opened. */
export type Favorite = Pick<Movie, "id" | "title" | "genres" | "year" | "score" | "poster" | "rating">;

const KEY = "movie-tonight:favorites";
const listeners = new Set<() => void>();
let snapshot: Favorite[] | null = null; // stable reference between changes (needed by useSyncExternalStore)

const isFavorite = (v: unknown): v is Favorite => {
  const f = v as Favorite;
  return !!f && typeof f.id === "number" && typeof f.title === "string";
};

function read(): Favorite[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isFavorite) : [];
  } catch {
    return [];
  }
}

const emit = () => listeners.forEach((l) => l());

function commit(list: Favorite[]) {
  snapshot = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the list still works in memory for this session.
  }
  emit();
}

// Keeps several tabs in sync. Only attached while something is subscribed.
const onStorage = (e: StorageEvent) => {
  if (e.key === KEY || e.key === null) {
    snapshot = null;
    emit();
  }
};

const pick = (m: Favorite): Favorite => ({ id: m.id, title: m.title, genres: m.genres, year: m.year, score: m.score, poster: m.poster, rating: m.rating });

export const favorites = {
  getAll: (): Favorite[] => (snapshot ??= read()),
  has: (id: number): boolean => favorites.getAll().some((f) => f.id === id),
  add(movie: Favorite) {
    if (!favorites.has(movie.id)) commit([pick(movie), ...favorites.getAll()]); // newest first
  },
  remove(id: number) {
    if (favorites.has(id)) commit(favorites.getAll().filter((f) => f.id !== id));
  },
  /** Returns true when the movie is now a favorite. */
  toggle(movie: Favorite): boolean {
    if (favorites.has(movie.id)) { favorites.remove(movie.id); return false; }
    favorites.add(movie);
    return true;
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    if (listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      if (!listeners.size) window.removeEventListener("storage", onStorage);
    };
  },
};
