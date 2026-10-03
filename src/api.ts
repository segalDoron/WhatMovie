import type { Answers, Movie } from "./types";

export async function fetchMovies(
  payload: { mode: "text"; input: string } | { mode: "answers"; answers: Answers }
): Promise<Movie[]> {
  const res = await fetch("/api/movies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load movies");
  return data.movies as Movie[];
}

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
