import type { Movie } from "./types";
import { users } from "./users";

export type VotedMovie = Pick<Movie, "id" | "title" | "genres" | "year" | "score" | "poster" | "rating">;

export interface VoteStore {
  like: VotedMovie[];
  dislike: VotedMovie[];
}
export type Vote = keyof VoteStore;

const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const pick = (m: VotedMovie): VotedMovie => ({
  id: m.id,
  title: m.title,
  genres: m.genres,
  year: m.year,
  score: m.score,
  poster: m.poster,
  rating: m.rating,
});

export const votes = {
  getAll: (): VoteStore => users.getActive()?.votes ?? { like: [], dislike: [] },

  has: (kind: Vote, id: number): boolean => votes.getAll()[kind].some((m) => m.id === id),

  /**
   * Adds the movie to `kind`, or removes it if it is already there.
   * A movie can only be liked or disliked, so voting one way removes the other vote.
   * Returns true when the movie now has that vote.
   */
  toggle(kind: Vote, movie: VotedMovie): boolean {
    const active = users.getActive();
    if (!active) return false;

    const other: Vote = kind === "like" ? "dislike" : "like";
    const cur = active.votes;

    if (votes.has(kind, movie.id)) {
      users.updateUser(active.id, {
        ...active,
        votes: { ...cur, [kind]: cur[kind].filter((m) => m.id !== movie.id) },
      });
      return false;
    }

    users.updateUser(active.id, {
      ...active,
      votes: {
        ...cur,
        [kind]: [pick(movie), ...cur[kind]], // newest first
        [other]: cur[other].filter((m) => m.id !== movie.id),
      },
    });
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
