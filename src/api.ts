import type { Answers, Movie } from "./types";

/** Opaque position in the search ("where to continue"). Sent back to the server for "show more". */
export type Cursor = unknown;
export interface SearchResult { movies: Movie[]; cursor: Cursor | null }

async function search(body: object): Promise<SearchResult> {
  const res = await fetch("/api/movies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load movies");
  return { movies: data.movies as Movie[], cursor: data.cursor ?? null };
}

export const fetchMovies = (answers: Answers) => search({ mode: "answers", answers });

/** The next batch: continues from the cursor and skips movies already shown. */
export const fetchMore = (answers: Answers, cursor: Cursor, seen: number[]) =>
  search({ mode: "more", answers, cursor, seen });

export interface CastMember { name: string; character: string }
const castCache = new Map<number, CastMember[]>();

export async function fetchCast(id: number): Promise<CastMember[]> {
  const hit = castCache.get(id);
  if (hit) return hit;
  const res = await fetch("/api/movies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "cast", id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load cast");
  castCache.set(id, data.cast);
  return data.cast as CastMember[];
}

import type { Movie as MovieDetails } from "./types";
const movieCache = new Map<number, MovieDetails>();

/** Full movie details from TMDB (used when a favorite is opened). */
export async function fetchMovie(id: number): Promise<MovieDetails> {
  const hit = movieCache.get(id);
  if (hit) return hit;
  const res = await fetch("/api/movies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "movie", id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load movie");
  movieCache.set(id, data.movie);
  return data.movie as MovieDetails;
}

const trailerCache = new Map<number, string | null>();

/** YouTube key of the best trailer for a movie, or null when none exists. */
export async function fetchTrailer(id: number): Promise<string | null> {
  if (trailerCache.has(id)) return trailerCache.get(id)!;
  const res = await fetch("/api/movies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "trailer", id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load trailer");
  trailerCache.set(id, data.key ?? null);
  return data.key ?? null;
}
