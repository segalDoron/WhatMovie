import type { Movie } from "./types";

export type VotedMovie = Pick<Movie, "id" | "title" | "genres" | "year" | "score" | "poster" | "rating">;

export interface VoteStore {
  like: VotedMovie[];
  dislike: VotedMovie[];
}
export type Vote = keyof VoteStore;

const KEY = "vote";
const listeners = new Set<() => void>();
let snapshot: VoteStore | null = null; // stable reference between changes (needed by useSyncExternalStore)

const isVoted = (v: unknown): v is VotedMovie => {
  const m = v as VotedMovie;
  return !!m && typeof m.id === "number" && typeof m.title === "string";
};

function read(): VoteStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      like: Array.isArray(parsed?.like) ? parsed.like.filter(isVoted) : [],
      dislike: Array.isArray(parsed?.dislike) ? parsed.dislike.filter(isVoted) : [],
    };
  } catch {
    return { like: [], dislike: [] };
  }
}

const emit = () => listeners.forEach((l) => l());

function commit(store: VoteStore) {
  snapshot = store;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: votes still work in memory for this session.
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

const pick = (m: VotedMovie): VotedMovie => ({
  id: m.id, title: m.title, genres: m.genres, year: m.year, score: m.score, poster: m.poster, rating: m.rating,
});

export const votes = {
  getAll: (): VoteStore => (snapshot ??= read()),
  has: (kind: Vote, id: number): boolean => votes.getAll()[kind].some((m) => m.id === id),
  /**
   * Adds the movie to `kind`, or removes it if it is already there.
   * A movie can only be liked or disliked, so voting one way removes the other vote.
   * Returns true when the movie now has that vote.
   */
  toggle(kind: Vote, movie: VotedMovie): boolean {
    const other: Vote = kind === "like" ? "dislike" : "like";
    const cur = votes.getAll();
    if (votes.has(kind, movie.id)) {
      commit({ ...cur, [kind]: cur[kind].filter((m) => m.id !== movie.id) });
      return false;
    }
    commit({
      ...cur,
      [kind]: [pick(movie), ...cur[kind]], // newest first
      [other]: cur[other].filter((m) => m.id !== movie.id),
    });
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