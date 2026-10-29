import type { Answers, Movie } from "./types";
import { supabase } from "./supabase";

/** The user's taste as movie ids only: favorites, likes and dislikes steer the ranking, and with watched they are never offered again. */
export interface Taste { favorites: number[]; likes: number[]; dislikes: number[]; watched: number[] }
export const NO_TASTE: Taste = { favorites: [], likes: [], dislikes: [], watched: [] };

/** Opaque position in the search ("where to continue"). Sent back to the server for "show more". */
export type Cursor = unknown;
export interface SearchResult { movies: Movie[]; cursor: Cursor | null }

/** The signed-in user's token, when there is one. Searches work without it; with it the server can use the user's own Gemini key. */
async function optionalAuth(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function search(body: object): Promise<SearchResult> {
  const res = await fetch("/api/movies", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await optionalAuth()) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load movies");
  return { movies: data.movies as Movie[], cursor: data.cursor ?? null };
}

export const fetchMovies = (answers: Answers, taste: Taste = NO_TASTE) => search({ mode: "answers", answers, taste });

/** The next batch: continues from the cursor and skips movies already shown. */
export const fetchMore = (answers: Answers, cursor: Cursor, seen: number[], taste: Taste = NO_TASTE) =>
  search({ mode: "more", answers, cursor, seen, taste });

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
const imagesCache = new Map<number, string[]>();
/** Up to five backdrop images for the details page carousel. */
export async function fetchImages(id: number): Promise<string[]> {
  const hit = imagesCache.get(id);
  if (hit) return hit;
  const res = await fetch("/api/movies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "images", id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load images");
  const images: string[] = Array.isArray(data.images) ? data.images : [];
  imagesCache.set(id, images);
  return images;
}

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
