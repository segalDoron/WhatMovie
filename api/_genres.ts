// Genre compatibility. For each genre the user can request: which other genres go well with it, and which clash.
// These are default heuristics, not absolute rules. Override any of them with a GENRE_CONFIG JSON environment variable, e.g.
// {"affinity":{"Comedy":{"compatible":["Romance","Family"],"conflicting":["Horror"]}},"scores":{"conflict":35}}  (names or TMDB ids).

export const GENRE_IDS: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14,
  History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, "Science Fiction": 878, "TV Movie": 10770,
  Thriller: 53, War: 10752, Western: 37,
};

// The requested genre -> compatible (higher priority) and conflicting (lower priority) combinations.
// Entries that describe a tone rather than a genre ("slapstick comedy", "action-heavy", "light comedy", ...) are in TONE_RULES below:
// they depend on what the movie's keywords say, so a dark Horror+Comedy is perfect for a Horror request and a light one is not.
const AFFINITY_NAMES: Record<string, { compatible: string[]; conflicting: string[] }> = {
  Action: { compatible: ["Adventure", "Thriller", "Crime", "Science Fiction"], conflicting: ["Romance", "Music", "Family"] },
  Adventure: { compatible: ["Action", "Fantasy", "Science Fiction", "Family"], conflicting: ["Horror", "Romance"] },
  Animation: { compatible: ["Family", "Fantasy", "Adventure", "Comedy"], conflicting: ["Horror", "Crime", "Thriller"] },
  Comedy: { compatible: ["Romance", "Family", "Adventure", "Action"], conflicting: ["Horror", "Thriller", "War"] },
  Crime: { compatible: ["Thriller", "Mystery", "Drama", "Action"], conflicting: ["Family", "Fantasy", "Music"] },
  Documentary: { compatible: ["History", "Music", "TV Movie"], conflicting: ["Fantasy", "Horror", "Action"] },
  Drama: { compatible: ["Romance", "History", "Crime", "Mystery"], conflicting: ["Horror"] }, // slapstick comedy and action-heavy: see TONE_RULES
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

/* ---------- Tone: what a movie's TMDB keywords say about it ---------- */
// Tone tag -> keyword names that signal it. The keyword ids are looked up by name once (and cached), so no ids are hard-coded.
export const TONE_KEYWORDS: Record<string, string[]> = {
  darkcomedy: ["dark comedy", "black comedy"],
  horrorcomedy: ["horror comedy", "comedy horror", "zombie comedy", "vampire comedy"],
  gore: ["gore", "slasher", "splatter", "blood and gore"],
  slapstick: ["slapstick", "slapstick comedy", "farce", "gross-out comedy"],
  light: ["romantic comedy", "romcom", "feel-good", "feel good", "lighthearted", "teen comedy", "family comedy", "screwball comedy"],
  parody: ["parody", "spoof"],
  satire: ["satire"],
  actionheavy: ["martial arts", "shootout", "car chase", "explosion", "gunfight", "one man army"],
  realistic: ["based on true story", "biography", "docudrama", "social realism", "realism"],
};
export const TONE_TAGS = Object.keys(TONE_KEYWORDS);

export type Effect = "strong" | "compatible" | "neutral" | "conflict";
/** For a movie that has the extra genre, when the request includes one of the `request` genres and the keywords show one of `tags`
 * (and none of `unless`), the extra genre counts as `effect` instead of what the table says. The first matching rule wins. */
export interface ToneRule { request: number[]; extra: number; tags: string[]; unless?: string[]; effect: Effect }

// The tone entries of the compatibility table.
const TONE_RULES_NAMES: { request: string[]; extra: string; tags: string[]; unless?: string[]; effect: Effect }[] = [
  // Horror comedy is a perfect Horror request; a light, romantic or slapstick comedy with horror trimmings is not.
  { request: ["Horror"], extra: "Comedy", tags: ["darkcomedy", "horrorcomedy", "gore"], effect: "strong" },
  { request: ["Horror"], extra: "Comedy", tags: ["light", "slapstick"], effect: "conflict" },
  { request: ["Thriller"], extra: "Comedy", tags: ["darkcomedy"], effect: "compatible" },
  { request: ["Thriller"], extra: "Comedy", tags: ["light", "slapstick"], effect: "conflict" },
  { request: ["Mystery"], extra: "Comedy", tags: ["darkcomedy"], effect: "compatible" },
  { request: ["Mystery"], extra: "Comedy", tags: ["slapstick", "parody"], effect: "conflict" },
  { request: ["Comedy"], extra: "Horror", tags: ["darkcomedy", "horrorcomedy"], effect: "compatible" },
  { request: ["Comedy"], extra: "Thriller", tags: ["darkcomedy"], effect: "neutral" },
  { request: ["Comedy"], extra: "War", tags: ["darkcomedy", "satire", "parody"], effect: "neutral" },
  { request: ["Drama"], extra: "Comedy", tags: ["slapstick"], effect: "conflict" },
  { request: ["Drama"], extra: "Action", tags: ["actionheavy"], effect: "conflict" },
  { request: ["Romance"], extra: "Action", tags: ["actionheavy"], effect: "conflict" },
  { request: ["Fantasy"], extra: "Drama", tags: ["realistic"], effect: "conflict" },
];

export interface GenreConfig {
  // 0-100 relevance of a movie for the requested genres, by what else it is.
  scores: { pure: number; strong: number; compatible: number; neutral: number; conflict: number; none: number };
  tiers: [number, number, number, number]; // lower bounds of tier 0 (strong), 1 (compatible), 2 (moderate), 3 (conflicting); below = tier 4 (weak)
  orPenalty: number; // points lost when an "any of" request is matched by fewer of the selected genres
  affinity: Record<number, { compatible: number[]; conflicting: number[] }>;
  tone: ToneRule[];
  toneKeywords: Record<string, string[]>;
}

const toId = (v: unknown): number | undefined => (typeof v === "number" ? v : typeof v === "string" ? GENRE_IDS[v] : undefined);
const toIds = (v: unknown): number[] => (Array.isArray(v) ? v.map(toId).filter((x): x is number => x !== undefined) : []);

export const DEFAULT_GENRES: GenreConfig = {
  scores: { pure: 100, strong: 92, compatible: 85, neutral: 65, conflict: 40, none: 20 },
  tiers: [90, 75, 55, 30],
  orPenalty: 8,
  affinity: Object.fromEntries(
    Object.entries(AFFINITY_NAMES).map(([name, a]) => [GENRE_IDS[name], { compatible: toIds(a.compatible), conflicting: toIds(a.conflicting) }])
  ),
  tone: TONE_RULES_NAMES.map((r) => ({ request: toIds(r.request), extra: toId(r.extra)!, tags: r.tags, ...(r.unless ? { unless: r.unless } : {}), effect: r.effect })),
  toneKeywords: TONE_KEYWORDS,
};

export function genreConfig(raw: string | undefined = process.env.GENRE_CONFIG): GenreConfig {
  if (!raw) return DEFAULT_GENRES;
  try {
    const o = JSON.parse(raw) as {
      scores?: Record<string, unknown>; tiers?: unknown; orPenalty?: unknown; affinity?: Record<string, { compatible?: unknown; conflicting?: unknown }>;
      tone?: { request?: unknown; extra?: unknown; tags?: unknown; unless?: unknown; effect?: unknown }[]; toneKeywords?: Record<string, unknown>;
    };
    const cfg: GenreConfig = { ...DEFAULT_GENRES, scores: { ...DEFAULT_GENRES.scores }, affinity: { ...DEFAULT_GENRES.affinity } };
    for (const [k, v] of Object.entries(o.scores ?? {})) if (k in cfg.scores && typeof v === "number" && Number.isFinite(v)) (cfg.scores as Record<string, number>)[k] = v;
    if (Array.isArray(o.tiers) && o.tiers.length === 4 && o.tiers.every((n) => typeof n === "number")) cfg.tiers = o.tiers as GenreConfig["tiers"];
    if (typeof o.orPenalty === "number" && Number.isFinite(o.orPenalty)) cfg.orPenalty = o.orPenalty;
    for (const [name, a] of Object.entries(o.affinity ?? {})) {
      const id = toId(Number.isNaN(Number(name)) ? name : Number(name));
      if (id !== undefined) cfg.affinity[id] = { compatible: toIds(a?.compatible), conflicting: toIds(a?.conflicting) };
    }
    if (Array.isArray(o.tone)) {
      const effects = ["strong", "compatible", "neutral", "conflict"];
      cfg.tone = o.tone.flatMap((r) => {
        const extra = toId(r?.extra);
        const tags = Array.isArray(r?.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [];
        if (extra === undefined || !tags.length || typeof r?.effect !== "string" || !effects.includes(r.effect)) return [];
        const unless = Array.isArray(r.unless) ? r.unless.filter((t): t is string => typeof t === "string") : undefined;
        return [{ request: toIds(r.request), extra, tags, ...(unless ? { unless } : {}), effect: r.effect as Effect }];
      });
    }
    if (o.toneKeywords && typeof o.toneKeywords === "object") {
      cfg.toneKeywords = { ...DEFAULT_GENRES.toneKeywords };
      for (const [tag, names] of Object.entries(o.toneKeywords)) if (Array.isArray(names)) cfg.toneKeywords[tag] = names.filter((n): n is string => typeof n === "string");
    }
    return cfg;
  } catch {
    return DEFAULT_GENRES;
  }
}

/** The tone tags of a movie, from all its keyword ids. `byId` maps a keyword id to the tags it signals. */
export function toneTags(keywordIds: number[], byId: Map<number, string[]>): string[] {
  const tags = new Set<string>();
  for (const id of keywordIds) for (const t of byId.get(id) ?? []) tags.add(t);
  return [...tags];
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
export function genreRelevance(genres: number[], ask: GenreAsk, cfg: GenreConfig = DEFAULT_GENRES, tags: string[] = []): Relevance {
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
    let effect: Effect = compatible ? "compatible" : conflicting ? "conflict" : "neutral";
    // The keywords can settle what the genre labels cannot (dark vs light comedy, action-heavy, slapstick...).
    const rule = cfg.tone.find((r) => r.extra === extra && r.request.some((g) => requested.has(g)) && r.tags.some((t) => tags.includes(t)) && !(r.unless ?? []).some((t) => tags.includes(t)));
    if (rule) effect = rule.effect;
    score = Math.min(score, cfg.scores[effect]);
  }
  if (!ask.must.length && ask.any.length > 1) {
    const matched = ask.any.filter((g) => genres.includes(g)).length;
    score -= (cfg.orPenalty * (ask.any.length - matched)) / (ask.any.length - 1);
  }
  return done(score);
}
