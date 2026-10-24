// Genre compatibility. For each genre the user can request: which other genres go well with it, and which clash.
// These are default heuristics, not absolute rules. Override any of them with a GENRE_CONFIG JSON environment variable, e.g.
// {"affinity":{"Comedy":{"compatible":["Romance","Family"],"conflicting":["Horror"]}},"scores":{"conflict":35}}  (names or TMDB ids).

export const GENRE_IDS: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14,
  History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, "Science Fiction": 878, "TV Movie": 10770,
  Thriller: 53, War: 10752, Western: 37,
};

// The requested genre -> compatible (higher priority) and conflicting (lower priority) combinations.
// Entries that describe a tone rather than a genre ("slapstick comedy", "action-heavy", "light comedy") are left out for now:
// they need keyword evidence, so a Horror+Comedy movie is not penalized for a Horror request.
const AFFINITY_NAMES: Record<string, { compatible: string[]; conflicting: string[] }> = {
  Action: { compatible: ["Adventure", "Thriller", "Crime", "Science Fiction"], conflicting: ["Romance", "Music", "Family"] },
  Adventure: { compatible: ["Action", "Fantasy", "Science Fiction", "Family"], conflicting: ["Horror", "Romance"] },
  Animation: { compatible: ["Family", "Fantasy", "Adventure", "Comedy"], conflicting: ["Horror", "Crime", "Thriller"] },
  Comedy: { compatible: ["Romance", "Family", "Adventure", "Action"], conflicting: ["Horror", "Thriller", "War"] },
  Crime: { compatible: ["Thriller", "Mystery", "Drama", "Action"], conflicting: ["Family", "Fantasy", "Music"] },
  Documentary: { compatible: ["History", "Music", "TV Movie"], conflicting: ["Fantasy", "Horror", "Action"] },
  Drama: { compatible: ["Romance", "History", "Crime", "Mystery"], conflicting: ["Action", "Horror"] },
  Family: { compatible: ["Animation", "Comedy", "Adventure", "Fantasy"], conflicting: ["Horror", "Crime", "War"] },
  Fantasy: { compatible: ["Adventure", "Family", "Animation", "Science Fiction"], conflicting: ["Crime", "War"] },
  History: { compatible: ["Drama", "War", "Documentary", "Romance"], conflicting: ["Science Fiction", "Fantasy", "Horror"] },
  Horror: { compatible: ["Thriller", "Mystery", "Science Fiction", "Fantasy"], conflicting: ["Family", "Romance"] },
  Music: { compatible: ["Romance", "Drama", "Comedy", "Documentary"], conflicting: ["Horror", "War", "Crime"] },
  Mystery: { compatible: ["Thriller", "Crime", "Drama", "Horror"], conflicting: ["Family"] },
  Romance: { compatible: ["Comedy", "Drama", "Music", "Fantasy"], conflicting: ["Horror", "War"] },
  "Science Fiction": { compatible: ["Action", "Adventure", "Thriller", "Mystery"], conflicting: ["Romance", "Family", "History"] },
  "TV Movie": { compatible: ["Drama", "Romance", "Comedy", "Family"], conflicting: [] },
  Thriller: { compatible: ["Mystery", "Crime", "Action", "Horror", "Drama"], conflicting: ["Family", "Music"] },
  War: { compatible: ["Drama", "History", "Action", "Thriller"], conflicting: ["Family", "Comedy", "Romance"] },
  Western: { compatible: ["Action", "Adventure", "Drama", "Crime"], conflicting: ["Fantasy", "Music", "Family"] },
};

export interface GenreConfig {
  // 0-100 relevance of a movie for the requested genres, by what else it is.
  scores: { pure: number; compatible: number; neutral: number; conflict: number; none: number };
  tiers: [number, number, number, number]; // lower bounds of tier 0 (strong), 1 (compatible), 2 (moderate), 3 (conflicting); below = tier 4 (weak)
  orPenalty: number; // points lost when an "any of" request is matched by fewer of the selected genres
  affinity: Record<number, { compatible: number[]; conflicting: number[] }>;
}

const toId = (v: unknown): number | undefined => (typeof v === "number" ? v : typeof v === "string" ? GENRE_IDS[v] : undefined);
const toIds = (v: unknown): number[] => (Array.isArray(v) ? v.map(toId).filter((x): x is number => x !== undefined) : []);

export const DEFAULT_GENRES: GenreConfig = {
  scores: { pure: 100, compatible: 85, neutral: 65, conflict: 40, none: 20 },
  tiers: [90, 75, 55, 30],
  orPenalty: 8,
  affinity: Object.fromEntries(
    Object.entries(AFFINITY_NAMES).map(([name, a]) => [GENRE_IDS[name], { compatible: toIds(a.compatible), conflicting: toIds(a.conflicting) }])
  ),
};

export function genreConfig(raw: string | undefined = process.env.GENRE_CONFIG): GenreConfig {
  if (!raw) return DEFAULT_GENRES;
  try {
    const o = JSON.parse(raw) as { scores?: Record<string, unknown>; tiers?: unknown; orPenalty?: unknown; affinity?: Record<string, { compatible?: unknown; conflicting?: unknown }> };
    const cfg: GenreConfig = { ...DEFAULT_GENRES, scores: { ...DEFAULT_GENRES.scores }, affinity: { ...DEFAULT_GENRES.affinity } };
    for (const [k, v] of Object.entries(o.scores ?? {})) if (k in cfg.scores && typeof v === "number" && Number.isFinite(v)) (cfg.scores as Record<string, number>)[k] = v;
    if (Array.isArray(o.tiers) && o.tiers.length === 4 && o.tiers.every((n) => typeof n === "number")) cfg.tiers = o.tiers as GenreConfig["tiers"];
    if (typeof o.orPenalty === "number" && Number.isFinite(o.orPenalty)) cfg.orPenalty = o.orPenalty;
    for (const [name, a] of Object.entries(o.affinity ?? {})) {
      const id = toId(Number.isNaN(Number(name)) ? name : Number(name));
      if (id !== undefined) cfg.affinity[id] = { compatible: toIds(a?.compatible), conflicting: toIds(a?.conflicting) };
    }
    return cfg;
  } catch {
    return DEFAULT_GENRES;
  }
}

/** The genres the user asked for: every one of `must` is required, at least one of `any` is. Empty = no genre filter. */
export interface GenreAsk { must: number[]; any: number[] }

export interface Relevance {
  score: number; // 0..100
  tier: 0 | 1 | 2 | 3 | 4; // 0 = pure / strong, 1 = compatible, 2 = moderate, 3 = conflicting, 4 = weak
}

/**
 * How well a movie's genres match what was requested, judged from the requested genre (not from global genre popularity).
 * - Genres the user asked for are never penalized, even when they normally clash with each other.
 * - Extra genres are compatible, neutral or conflicting for the request. Only the worst extra counts, so a movie is not
 *   marked down for simply having more genres.
 * - For an "any of" request, matching more of the selected genres scores slightly higher.
 * With no genre filter every movie is a strong match (nothing to rank by).
 */
export function genreRelevance(genres: number[], ask: GenreAsk, cfg: GenreConfig = DEFAULT_GENRES): Relevance {
  const requested = new Set([...ask.must, ...ask.any]);
  const tierOf = (score: number): Relevance["tier"] => (score >= cfg.tiers[0] ? 0 : score >= cfg.tiers[1] ? 1 : score >= cfg.tiers[2] ? 2 : score >= cfg.tiers[3] ? 3 : 4);
  const done = (score: number): Relevance => ({ score, tier: tierOf(score) });
  if (!requested.size) return done(cfg.scores.pure);
  if (!genres.length) return done(cfg.scores.neutral); // no genre data: neutral
  if (!genres.some((g) => requested.has(g))) return done(cfg.scores.none);

  let score = cfg.scores.pure;
  for (const extra of genres.filter((g) => !requested.has(g))) {
    const compatible = [...requested].some((r) => cfg.affinity[r]?.compatible.includes(extra));
    const conflicting = !compatible && [...requested].every((r) => cfg.affinity[r]?.conflicting.includes(extra));
    score = Math.min(score, compatible ? cfg.scores.compatible : conflicting ? cfg.scores.conflict : cfg.scores.neutral);
  }
  if (!ask.must.length && ask.any.length > 1) {
    const matched = ask.any.filter((g) => genres.includes(g)).length;
    score -= (cfg.orPenalty * (ask.any.length - matched)) / (ask.any.length - 1);
  }
  return done(score);
}
