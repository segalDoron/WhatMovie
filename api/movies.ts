// Vercel serverless function. API keys stay on the server (env vars).
import { userGeminiKey } from "./_shared.js";
import { rankConfig, scorePool, selectPage, type Features, type Signal } from "./_rank.js";
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

interface TmdbMovie {
  id: number; title: string; release_date?: string; vote_average: number;
  poster_path: string | null; backdrop_path: string | null; overview: string; genre_ids?: number[];
  original_language?: string; vote_count?: number; popularity?: number;
}
interface Movie {
  id: number; title: string; genres: string[]; year: string; score: number;
  poster: string | null; backdrop: string | null; overview: string; rating: string; providers: string[]; runtime?: number;
}

async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(TMDB + path);
  url.searchParams.set("api_key", process.env.TMDB_API_KEY ?? "");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json() as Promise<T>;
}

async function genreMap(): Promise<Map<number, string>> {
  const { genres } = await tmdb<{ genres: { id: number; name: string }[] }>("/genre/movie/list");
  return new Map(genres.map((g) => [g.id, g.name]));
}

const toMovie = (m: TmdbMovie, g: Map<number, string>): Movie => ({
  id: m.id,
  title: m.title,
  genres: (m.genre_ids ?? []).map((id) => g.get(id)).filter(Boolean) as string[],
  year: m.release_date?.slice(0, 4) ?? "",
  score: Math.round(m.vote_average * 10) / 10,
  poster: m.poster_path ? `${IMG}/w342${m.poster_path}` : null,
  backdrop: m.backdrop_path ? `${IMG}/w780${m.backdrop_path}` : null,
  overview: m.overview,
  rating: "",
  providers: [],
});

/* Age rating and streaming services for the viewer's region (falls back to the US for the rating). */
interface ExtrasPayload {
  runtime?: number | null; // minutes
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  "watch/providers"?: { results: Record<string, { flatrate?: { provider_name: string; display_priority?: number }[] }> };
}
const EXTRAS = { append_to_response: "release_dates,watch/providers" };

function pickExtras(d: ExtrasPayload): { rating: string; providers: string[]; runtime?: number } {
  const region = process.env.WATCH_REGION ?? "US";
  const cert = (country: string) =>
    d.release_dates?.results.find((x) => x.iso_3166_1 === country)?.release_dates.find((r) => r.certification)?.certification ?? "";
  const names = (d["watch/providers"]?.results[region]?.flatrate ?? [])
    .slice()
    .sort((x, y) => (x.display_priority ?? 99) - (y.display_priority ?? 99))
    .map((p) => p.provider_name)
    .filter((n) => !/with ads/i.test(n)); // skip the ad-tier duplicates ("Netflix Standard with Ads")
  return { rating: cert(region) || cert("US"), providers: unique(names).slice(0, 6), ...(d.runtime ? { runtime: d.runtime } : {}) };
}

/* ---------- Details and ranking features (one TMDB call per movie, cached while the server instance stays warm) ---------- */
interface DetailPayload extends ExtrasPayload {
  genres?: { id: number; name: string }[];
  belongs_to_collection?: { id: number } | null;
  credits?: { cast?: { id: number }[]; crew?: { id: number; job: string }[] };
  keywords?: { keywords?: { id: number }[] };
  vote_average?: number; vote_count?: number; popularity?: number; original_language?: string; release_date?: string;
}
const DETAILS = { append_to_response: "release_dates,watch/providers,credits,keywords" };
interface Detail { f: Features; extras: { rating: string; providers: string[]; runtime?: number } }
const detailCache = new Map<number, Detail>();

async function loadDetail(id: number): Promise<Detail | null> {
  const hit = detailCache.get(id);
  if (hit) return hit;
  try {
    const d = await tmdb<DetailPayload>(`/movie/${id}`, DETAILS);
    const f: Features = {
      id,
      g: (d.genres ?? []).map((x) => x.id).slice(0, 8),
      k: (d.keywords?.keywords ?? []).map((x) => x.id).slice(0, 15),
      c: (d.credits?.cast ?? []).map((x) => x.id).slice(0, 5),
      d: (d.credits?.crew ?? []).filter((x) => x.job === "Director").map((x) => x.id).slice(0, 3),
      y: Number(d.release_date?.slice(0, 4)) || 0,
      l: d.original_language ?? "",
      col: d.belongs_to_collection?.id ?? 0,
      va: d.vote_average ?? 0,
      vc: d.vote_count ?? 0,
      pop: d.popularity ?? 0,
    };
    const out = { f, extras: pickExtras(d) };
    if (detailCache.size > 3000) detailCache.clear();
    detailCache.set(id, out);
    return out;
  } catch {
    return null;
  }
}

/** Runs `fn` over the list with at most `limit` calls in flight (TMDB rate limits). */
async function mapLimit<T, R>(list: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i]);
      }
    })
  );
  return out;
}

/** A movie ready to show, with the features used to rank it. */
interface Item { movie: Movie; f: Features; b?: number } // b: 0..1 share of the seed picks that recommend this movie

/** What the discover result already tells us, for when the details call fails. */
const basicFeatures = (m: TmdbMovie): Features => ({
  id: m.id, g: (m.genre_ids ?? []).slice(0, 8), k: [], c: [], d: [], y: Number(m.release_date?.slice(0, 4)) || 0,
  l: m.original_language ?? "", col: 0, va: m.vote_average ?? 0, vc: m.vote_count ?? 0, pop: m.popularity ?? 0,
});

async function hydrate(list: TmdbMovie[], g: Map<number, string>): Promise<Item[]> {
  const details = await mapLimit(list, 12, (m) => loadDetail(m.id));
  return list.map((m, i) => {
    const movie = toMovie(m, g);
    const d = details[i];
    if (d) Object.assign(movie, d.extras); // on failure the rating and providers stay empty
    return { movie, f: d?.f ?? basicFeatures(m) };
  });
}

/* ---------- Search: answers -> plan (rules, refined by Gemini) -> page loop with strict filtering ---------- */
type Answers = Record<string, string | string[]>;
type Params = Record<string, string | number>;
interface DiscoverPage { results: TmdbMovie[]; total_pages: number }

const TARGET = 20; // movies to return
const MAX_PAGES = 6; // TMDB pages scanned per phase

const ANIMATION = 16, FAMILY = 10751, HORROR = 27, DOCUMENTARY = 99, TV_MOVIE = 10770;

const GENRE_ID: Record<string, number> = {
  horror: 27, comedy: 35, scifi: 878, action: 28, drama: 18, thriller: 53,
  romance: 10749, animation: 16, fantasy: 14, crime: 80,
};
// Mood only suggests genres when the user picked none. Kept narrow on purpose (e.g. "thrilled" is not "action").
const MOOD: Record<string, { must?: number[]; any?: number[] }> = {
  laugh: { must: [35] }, thrilled: { any: [53] }, moved: { any: [18, 10749] }, mindbent: { any: [878, 9648] },
  comforted: { any: [35, 10751] }, twists: { any: [9648, 53] }, mystery: { must: [9648] },
};
const AVOID: Record<string, number> = { horror: 27, war: 10752, romance: 10749 };
// "This or that" taste picks that can be expressed as genres.
const TASTE_GENRES: Record<string, number[]> = {
  laugh: [35], tense: [53], think: [9648, 878], feel: [18, 10749], shocking: [9648, 53], action: [28], slow: [18, 9648],
};

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** Family-friendly mode: kids are watching, or the "Kids" genre was picked. */
const kidsMode = (a: Answers): boolean => a.who === "kids" || asList(a.genres).includes("kids");
/** Cartoons and anime only show up when asked for. */
const allowsAnimation = (a: Answers): boolean => {
  const g = asList(a.genres);
  return g.includes("animation") || g.includes("anime") || g.includes("kids") || a.who === "kids";
};

function yearRange(a: Answers) {
  return { from: Number(a.yearFrom) || undefined, to: Number(a.yearTo) || undefined };
}

/** What a movie must / must not have. */
interface Plan {
  mustHave: number[]; // ALL of these genres
  anyOf: number[]; // and at least one of these (when not empty)
  exclude: number[]; // and none of these
  keywords: string[]; // theme hints from Gemini (first pass only)
  minRating?: number;
  sortBy?: "popularity.desc" | "vote_average.desc";
}

function rulePlan(a: Answers): Plan {
  const plan: Plan = { mustHave: [], anyOf: [], exclude: [], keywords: [] };
  const picked = asList(a.genres);
  const ids = picked.map((k) => GENRE_ID[k]).filter(Boolean);
  // "Kids" and "Anime" are requirements on top of the other picks: Family movies, and Japanese animation.
  const needs = [picked.includes("kids") ? FAMILY : 0, picked.includes("anime") ? ANIMATION : 0].filter(Boolean);

  if (a.who === "kids") plan.anyOf = [FAMILY, ANIMATION];
  else if (ids.length || needs.length || picked.includes("crazynight")) {
    if (ids.includes(HORROR)) plan.mustHave.push(HORROR); // scary means Horror, never "action with scares"
    const rest = ids.filter((i) => i !== HORROR && !needs.includes(i));
    if (rest.length && rest.length <= 2) plan.mustHave.push(...rest); // a blend, e.g. horror comedy
    else if (rest.length) plan.anyOf = rest;
    if (!needs.length && !plan.mustHave.length && !plan.anyOf.length) plan.anyOf = [35, 80]; // "one crazy night"
  } else {
    const mood = MOOD[String(a.mood)];
    const taste = unique(asList(a.taste).flatMap((k) => TASTE_GENRES[k] ?? []));
    if (mood) { plan.mustHave = mood.must ?? []; plan.anyOf = mood.any ?? []; }
    else if (taste.length) plan.anyOf = taste;
  }
  plan.mustHave = unique([...plan.mustHave, ...needs]);
  return plan;
}

/** Rules that always apply, whatever Gemini said. */
function enforce(plan: Plan, a: Answers): Plan {
  const picked = asList(a.genres);
  const allowAnimation = allowsAnimation(a);
  const avoid = asList(a.avoid).map((k) => AVOID[k]).filter(Boolean);
  const strip = (ids: number[]) => unique(allowAnimation ? ids : ids.filter((g) => g !== ANIMATION)).filter((g) => !avoid.includes(g));

  const mustHave = strip(plan.mustHave);
  if (picked.includes("horror") && !avoid.includes(HORROR) && !mustHave.includes(HORROR)) mustHave.push(HORROR);
  const anyOf = strip(plan.anyOf);

  const exclude = new Set([DOCUMENTARY, TV_MOVIE, ...plan.exclude]);
  if (allowAnimation) exclude.delete(ANIMATION);
  else exclude.add(ANIMATION); // no cartoons or anime unless asked for
  for (const g of [...mustHave, ...anyOf]) exclude.delete(g); // never exclude what the user asked for
  for (const g of avoid) exclude.add(g);
  return { ...plan, mustHave, anyOf, exclude: [...exclude] };
}

/* ---------- Gemini: refine the plan (optional; the rule-based plan is the fallback) ---------- */
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
let cachedModel: string | undefined;

async function listTextModels(signal: AbortSignal, apiKey: string): Promise<string[]> {
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey }, signal });
  if (!res.ok) return [];
  const data = await res.json();
  const skip = /image|tts|live|audio|embed|imagen|veo|lyria|robotics|computer|learnlm|gemma|deep-research|native|exp/i;
  const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return ((data.models ?? []) as { name: string; supportedGenerationMethods?: string[] }[])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /flash/i.test(m.name) && !skip.test(m.name))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort((x, y) => Number(/preview/.test(x)) - Number(/preview/.test(y)) || version(y) - version(x));
}

/** Calls Gemini and parses its JSON reply. Returns null on any problem (no key, timeout, retired model, bad JSON). */
// userKey: the signed-in user's own key. Without one, the server's GEMINI_API_KEY is used. The model cache is only shared for the server key.
async function geminiJson(system: string, user: string, userKey?: string | null): Promise<unknown> {
  const apiKey = userKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const shared = !userKey;
  const deadline = Date.now() + 6000;
  const signal = () => AbortSignal.timeout(Math.max(500, deadline - Date.now()));
  const queue = [process.env.GEMINI_MODEL, shared ? cachedModel : undefined].filter(Boolean) as string[];
  const tried: string[] = [];
  let listed = false;
  try {
    while (tried.length < 4 && Date.now() < deadline) {
      if (!queue.length) {
        if (listed) break;
        listed = true;
        queue.push(...(await listTextModels(signal(), apiKey)));
        if (!queue.length) break;
      }
      const model = queue.shift()!;
      if (tried.includes(model)) continue;
      tried.push(model);
      const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
        method: "POST",
        signal: signal(),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      });
      if (res.ok) {
        if (shared) cachedModel = model;
        const data = await res.json();
        return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "null");
      }
      if (shared && model === cachedModel) cachedModel = undefined;
      if (![404, 403, 429].includes(res.status)) break; // other models are only tried for these
    }
  } catch {
    /* timeout, network error or invalid JSON: use the rule-based plan */
  }
  return null;
}

async function geminiPlan(a: Answers, genres: Map<number, string>, explicit: boolean, userKey?: string | null): Promise<Partial<Plan> | null> {
  const system = [
    "You turn a movie-picker form into precise TMDB discover filters. Reply with JSON only, in exactly this shape:",
    '{"genres": string[], "genreMatch": "all" | "any", "excludeGenres": string[], "keywords": string[], "minRating": number | null, "sortBy": "popularity.desc" | "vote_average.desc"}',
    `Allowed genre names: ${[...genres.values()].join(", ")}.`,
    "Rules:",
    "- Be precise and never pad the list. A request for scary or horror movies means only the Horror genre; do not add Action or Thriller to it.",
    '- "genres" are genres every result must belong to. Use genreMatch "all" for a blend such as horror comedy, otherwise "any".',
    '- "excludeGenres" lists genres that clash with the requested mood.',
    "- Never include Animation unless the user asked for animation, anime or kids, or kids are watching.",
    '- "keywords": at most 3 short TMDB keywords for a specific theme the user clearly implied (for example "twist ending", "slasher"), otherwise [].',
    "- Form keys: who (solo, partner, friends, kids), mood, genres (kids = family friendly, anime = Japanese animation), time, novelty, energy, taste (picks such as laugh, tense, think, feel, shocking, slow, gem, classic), loved (a movie they like), actor.",
  ].join("\n");

  const raw = (await geminiJson(system, JSON.stringify(a), userKey)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return null;

  const byName = new Map([...genres].map(([id, name]) => [name.toLowerCase(), id] as const));
  byName.set("sci-fi", 878);
  byName.set("scifi", 878);
  const toIds = (v: unknown) =>
    (Array.isArray(v) ? v : []).map((n) => byName.get(String(n).toLowerCase())).filter((x): x is number => !!x);

  const out: Partial<Plan> = { exclude: toIds(raw.excludeGenres) };
  const wanted = toIds(raw.genres);
  if (!explicit && wanted.length) {
    // When the user picked genres themselves, theirs win. Gemini only decides when none were picked.
    if (raw.genreMatch === "all") out.mustHave = wanted.slice(0, 3);
    else out.anyOf = wanted.slice(0, 4);
  }
  out.keywords = (Array.isArray(raw.keywords) ? raw.keywords : []).map((k) => String(k).trim()).filter((k) => k && k.length <= 30).slice(0, 3);
  const min = Number(raw.minRating);
  if (Number.isFinite(min) && min > 0) out.minRating = Math.min(min, 8.5);
  if (raw.sortBy === "vote_average.desc" || raw.sortBy === "popularity.desc") out.sortBy = raw.sortBy;
  return out;
}

function mergePlan(rule: Plan, ai: Partial<Plan>): Plan {
  const plan: Plan = { ...rule, exclude: unique([...rule.exclude, ...(ai.exclude ?? [])]), keywords: ai.keywords ?? [], minRating: ai.minRating, sortBy: ai.sortBy };
  if (ai.mustHave) { plan.mustHave = ai.mustHave; plan.anyOf = []; }
  else if (ai.anyOf) { plan.mustHave = []; plan.anyOf = ai.anyOf; }
  return plan;
}

/* ---------- Star rating (the TMDB score out of 10, shown with one decimal) ---------- */
// Each pick is a band of the score as the list shows it: "9" = 9.0 and up, "8" = 8.0 to 8.9, and so on.
const STAR_BANDS: Record<string, [number, number]> = { "9": [9, 10], "8": [8, 8.9], "7": [7, 7.9], "6": [6, 6.9] };
const r2 = (n: number) => Number(n.toFixed(2));

function starBands(a: Answers): [number, number][] {
  return asList(a.stars).filter((k) => Object.prototype.hasOwnProperty.call(STAR_BANDS, k)).map((k) => STAR_BANDS[k]);
}

/** Lowest score the API should return for the picked bands (a little under, because scores are rounded to one decimal). 0 = no pick. */
function starFloor(a: Answers): number {
  const bands = starBands(a);
  return bands.length ? r2(Math.min(...bands.map((b) => b[0])) - 0.05) : 0;
}

/**
 * Exact check for every movie. TMDB can only filter one range (lowest to highest pick), so picks with a gap,
 * like 9+ and 6-6.9, would let the scores in between through. Uses the same rounding as the score on screen.
 */
function starFilter(a: Answers): ((m: TmdbMovie) => boolean) | undefined {
  const bands = starBands(a);
  if (!bands.length) return undefined;
  return (m) => {
    const score = Number((m.vote_average ?? 0).toFixed(1));
    return bands.some(([lo, hi]) => score >= lo && score <= hi);
  };
}

/** Checks every candidate, whatever its source: the picked star bands, and Japanese originals for anime. */
function movieFilter(a: Answers): ((m: TmdbMovie) => boolean) | undefined {
  const stars = starFilter(a);
  const anime = asList(a.genres).includes("anime");
  if (!stars && !anime) return undefined;
  return (m) => (!stars || stars(m)) && (!anime || m.original_language === "ja");
}

/* ---------- Age ratings (US certifications) ---------- */
const RATING_ORDER = ["G", "PG", "PG-13", "R", "NC-17"];

/** The age ratings the user picked, in order. With kids watching only G and PG can apply (the kids rule stays on). */
function ratingPicks(a: Answers): string[] {
  const picks = RATING_ORDER.filter((r) => asList(a.ratings).includes(r));
  return kidsMode(a) ? picks.filter((r) => r === "G" || r === "PG") : picks;
}

/** TMDB filters a range (from the lowest pick to the highest). A gap, like G + R, lets PG and PG-13 in, so those picks are checked one by one. */
function ratingGap(a: Answers): Set<string> | null {
  const picks = ratingPicks(a);
  if (picks.length < 2) return null;
  const first = RATING_ORDER.indexOf(picks[0]);
  const last = RATING_ORDER.indexOf(picks[picks.length - 1]);
  return last - first + 1 === picks.length ? null : new Set(picks);
}

async function usRating(id: number): Promise<string> {
  try {
    const d = await tmdb<ExtrasPayload>(`/movie/${id}`, { append_to_response: "release_dates" });
    return d.release_dates?.results.find((x) => x.iso_3166_1 === "US")?.release_dates.find((r) => r.certification)?.certification ?? "";
  } catch {
    return "";
  }
}

/** Keeps only the movies whose US age rating is one of the allowed ones. */
async function keepRated(list: TmdbMovie[], allowed: Set<string>): Promise<TmdbMovie[]> {
  const ratings = await Promise.all(list.map((m) => usRating(m.id)));
  return list.filter((_, i) => allowed.has(ratings[i]));
}

/* ---------- TMDB query + page loop ---------- */
function baseParams(a: Answers, plan: Plan): Params {
  const taste = asList(a.taste);
  const p: Params = {
    "vote_count.gte": 300,
    "with_runtime.gte": 70, // skip shorts
    watch_region: process.env.WATCH_REGION ?? "US",
    sort_by: plan.sortBy ?? "popularity.desc",
    "vote_average.gte": plan.minRating ?? (a.energy === "focus" ? 7.3 : 6.3),
  };
  if (kidsMode(a)) { p.certification_country = "US"; p["certification.lte"] = "PG"; }
  if (asList(a.genres).includes("anime")) p.with_original_language = "ja"; // anime = Japanese animation
  const ratingList = ratingPicks(a);
  if (ratingList.length) {
    p.certification_country = "US";
    p["certification.gte"] = ratingList[0];
    p["certification.lte"] = ratingList[ratingList.length - 1];
  }
  if (a.time === "short") p["with_runtime.lte"] = 90;
  if (a.time === "medium") { p["with_runtime.gte"] = 85; p["with_runtime.lte"] = 130; }
  if (a.novelty === "familiar") { p.sort_by = "vote_average.desc"; p["vote_count.gte"] = 5000; }
  if (taste.includes("gem")) { p["vote_count.gte"] = 300; p["vote_count.lte"] = 4000; p["vote_average.gte"] = 7; p.sort_by = "vote_average.desc"; }
  if (taste.includes("classic")) { p["vote_count.gte"] = 8000; p.sort_by = "vote_average.desc"; }

  const bands = starBands(a);
  if (bands.length) {
    // An explicit star pick replaces the default quality floor.
    p["vote_average.gte"] = starFloor(a);
    const top = Math.max(...bands.map((b) => b[1]));
    if (top < 10) p["vote_average.lte"] = r2(top + 0.05);
  }

  const providers = asList(a.platform).filter((x) => x !== "any");
  if (providers.length) p.with_watch_providers = providers.join("|");
  const { from, to } = yearRange(a);
  if (from) p["primary_release_date.gte"] = `${from}-01-01`;
  if (to) p["primary_release_date.lte"] = `${to}-12-31`;

  // TMDB can't mix AND and OR, so it gets the AND list; the "any of" list is checked on every result below.
  if (plan.mustHave.length) p.with_genres = plan.mustHave.join(",");
  else if (plan.anyOf.length) p.with_genres = plan.anyOf.join("|");
  if (plan.exclude.length) p.without_genres = plan.exclude.join(",");
  return p;
}

/** The API filters are only a first pass: every movie is checked again here. */
function isValid(m: TmdbMovie, plan: Plan): boolean {
  const ids = m.genre_ids ?? [];
  if (!m.poster_path) return false;
  if (plan.mustHave.some((g) => !ids.includes(g))) return false;
  if (plan.anyOf.length && !plan.anyOf.some((g) => ids.includes(g))) return false;
  return !plan.exclude.some((g) => ids.includes(g));
}

/*
 * Page loop: keep fetching TMDB pages, filter each batch, and collect unique valid movies until the target is reached.
 * - seen: every movie ID already shown or looked at, so repeats never appear across pages, passes or "show more" requests.
 * - the page pointer (pass + page) says where to continue; it is returned to the app as a cursor.
 * Pass 0 is strict (quality + Gemini keywords). Pass 1 relaxes quality and keywords only.
 * Pass 2 is the generic fallback used only by "show more": nearby genres, much lighter filtering.
 */
const GENERIC_PASS = 2;

function globalExclude(a: Answers): number[] {
  const allowAnimation = allowsAnimation(a);
  const avoid = asList(a.avoid).map((k) => AVOID[k]).filter(Boolean);
  return unique([DOCUMENTARY, TV_MOVIE, ...(allowAnimation ? [] : [ANIMATION]), ...avoid]);
}

interface Pass { params: Params; plan: Plan }
// The cursor travels through the browser (opaque to it). It carries the ranked movies that were not shown yet (buf),
// the seed movie ids (sd), and whether TMDB has nothing more to give for these filters (done).
interface Cursor { pass: number; page: number; plan: Plan; kw: number[]; sd: number[]; buf: Item[]; done: boolean }

function buildPasses(a: Answers, plan: Plan, base: Params, kw: number[]): Pass[] {
  const near = asList(a.genres).includes("anime") ? [ANIMATION] : unique([...plan.mustHave, ...plan.anyOf]); // anime stays animation
  const ex = globalExclude(a);
  const floor = starFloor(a); // 0 unless stars were picked: the relaxed passes keep the picked star range
  const generic: Params = { ...base, "vote_count.gte": 50, "vote_average.gte": floor, "with_runtime.gte": 70, sort_by: "popularity.desc" };
  delete generic["vote_count.lte"];
  delete generic["with_runtime.lte"];
  delete generic.with_genres;
  if (near.length) generic.with_genres = near.join("|"); // any nearby genre instead of the full combination
  generic.without_genres = ex.join(",");
  return [
    { params: kw.length ? { ...base, with_keywords: kw.join("|") } : base, plan },
    { params: { ...base, "vote_count.gte": 100, "vote_average.gte": floor }, plan },
    { params: generic, plan: { mustHave: [], anyOf: near, exclude: ex, keywords: [] } },
  ];
}

async function collect(
  passes: Pass[],
  start: { pass: number; page: number },
  seen: Set<number>,
  opts: { target: number; maxScan: number; allowGeneric: boolean; accept?: (m: TmdbMovie) => boolean; verify?: (list: TmdbMovie[]) => Promise<TmdbMovie[]> }
): Promise<{ found: TmdbMovie[]; next: { pass: number; page: number } | null }> {
  const found: TmdbMovie[] = [];
  let { pass, page } = start;
  let scanned = 0;

  while (found.length < opts.target && pass < passes.length) {
    if (pass === GENERIC_PASS && !opts.allowGeneric) return { found, next: null }; // the loose "nearby genres" pass is off: filters stay mandatory
    if (scanned >= opts.maxScan) return { found, next: { pass, page } };

    const r = await tmdb<DiscoverPage>("/discover/movie", { ...passes[pass].params, page });
    scanned++;
    if (page > r.total_pages) {
      if (page === 1 || r.total_pages < 1) { pass++; page = 1; } // this pass is used up
      else page = 1; // the random start was past the last page
      continue;
    }
    const candidates: TmdbMovie[] = [];
    for (const m of r.results) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (isValid(m, passes[pass].plan) && (!opts.accept || opts.accept(m))) candidates.push(m);
    }
    for (const m of opts.verify ? await opts.verify(candidates) : candidates) {
      found.push(m);
      if (found.length >= opts.target) return { found, next: { pass, page } }; // resume on this page next time
    }
    if (page >= r.total_pages) { pass++; page = 1; }
    else page++;
  }
  return { found, next: pass < passes.length ? { pass, page } : null };
}

async function keywordIds(words: string[]): Promise<number[]> {
  const ids = await Promise.all(
    words.map((w) =>
      tmdb<{ results: { id: number }[] }>("/search/keyword", { query: w }).then((r) => r.results[0]?.id, () => undefined)
    )
  );
  return ids.filter((x): x is number => !!x);
}

/* ---------- Seed movies ("loved" + this-or-that picks): rank TMDB recommendations by how many seeds agree ---------- */
const parseSeed = (q: string) => {
  const m = q.match(/^(.*)\s\((\d{4})\)$/);
  return m ? { title: m[1], year: m[2] } : { title: q };
};

async function fromSeeds(seeds: string[], a: Answers, plan: Plan): Promise<{ seeds: TmdbMovie[]; candidates: TmdbMovie[]; agree: Map<number, number> }> {
  const found = await Promise.all(
    seeds.slice(0, 12).map(async (q) => {
      const { title, year } = parseSeed(q);
      const s = await tmdb<{ results: TmdbMovie[] }>("/search/movie", { query: title, ...(year ? { year } : {}) });
      return s.results[0];
    })
  );
  const seedMovies = found.filter(Boolean);
  if (!seedMovies.length) return { seeds: [], candidates: [], agree: new Map() };
  const seedIds = new Set(seedMovies.map((m) => m.id));

  const lists = await Promise.all(
    seedMovies.map((m) =>
      tmdb<{ results: TmdbMovie[] }>(`/movie/${m.id}/recommendations`).then((r) => r.results).catch(() => [] as TmdbMovie[])
    )
  );
  const tally = new Map<number, { m: TmdbMovie; n: number }>();
  for (const list of lists)
    for (const m of list) {
      if (seedIds.has(m.id)) continue;
      const e = tally.get(m.id);
      if (e) e.n++;
      else tally.set(m.id, { m, n: 1 });
    }
  // How many of the picks recommend each movie, as a share (1 = all of them).
  const agree = new Map([...tally].map(([id, e]) => [id, e.n / seedMovies.length] as [number, number]));
  const byFilter = movieFilter(a);
  const unfiltered = [...tally.values()].sort((x, y) => y.n - x.n || y.m.vote_average - x.m.vote_average).map((e) => e.m);
  const starred = byFilter ? unfiltered.filter(byFilter) : unfiltered;
  const agePicks = ratingPicks(a);
  const ranked = agePicks.length ? await keepRated(starred.slice(0, 60), new Set(agePicks)) : starred; // recommendations carry no age rating, so check it here

  const { from, to } = yearRange(a);
  const inYears = (m: TmdbMovie) => {
    const y = Number(m.release_date?.slice(0, 4));
    return !((from && y && y < from) || (to && y && y > to));
  };
  const strict = ranked.filter((m) => inYears(m) && isValid(m, plan));
  if (strict.length >= 8) return { seeds: seedMovies, candidates: strict.slice(0, 30), agree };
  // Too few: keep only the always-on rules (no cartoons, documentaries or skipped genres).
  const always = { ...plan, mustHave: [], anyOf: [], exclude: globalExclude(a) };
  return { seeds: seedMovies, candidates: ranked.filter((m) => inYears(m) && isValid(m, always)).slice(0, 30), agree };
}

/* Cursors come back from the browser, so check them before use. */
const ints = (v: unknown, max = 10): number[] => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger).slice(0, max) : []);
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const text = (v: unknown, max = 3000): string => (typeof v === "string" ? v.slice(0, max) : "");
const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.map((x) => text(x, 80)).filter(Boolean).slice(0, max) : []);

function cleanItem(o: unknown): Item | null {
  const it = o as { movie?: Record<string, unknown>; f?: Record<string, unknown>; b?: unknown } | null;
  const m = it?.movie, f = it?.f;
  if (!m || !f || !Number.isInteger(m.id) || m.id !== f.id) return null;
  const movie: Movie = {
    id: m.id as number, title: text(m.title, 200), genres: strings(m.genres, 8), year: text(m.year, 4), score: num(m.score),
    poster: typeof m.poster === "string" ? m.poster.slice(0, 300) : null, backdrop: typeof m.backdrop === "string" ? m.backdrop.slice(0, 300) : null,
    overview: text(m.overview), rating: text(m.rating, 10), providers: strings(m.providers, 6), ...(num(m.runtime) ? { runtime: num(m.runtime) } : {}),
  };
  const feat: Features = {
    id: f.id as number, g: ints(f.g, 8), k: ints(f.k, 15), c: ints(f.c, 5), d: ints(f.d, 3), y: num(f.y), l: text(f.l, 5),
    col: Number.isInteger(f.col) ? (f.col as number) : 0, va: num(f.va), vc: num(f.vc), pop: num(f.pop),
  };
  const b = clamp(num(it?.b), 0, 1);
  return { movie, f: feat, ...(b ? { b } : {}) };
}

function cleanCursor(c: unknown): Cursor | null {
  const o = c as (Partial<Cursor> & { buf?: unknown }) | null;
  if (!o || typeof o !== "object") return null;
  const p = (o.plan ?? {}) as Partial<Plan>;
  const pass = Math.min(Math.max(Number(o.pass) | 0, 0), GENERIC_PASS);
  const page = Math.min(Math.max(Number(o.page) | 0, 1), 500);
  const plan: Plan = {
    mustHave: ints(p.mustHave), anyOf: ints(p.anyOf), exclude: ints(p.exclude, 30), keywords: [],
    minRating: Number.isFinite(Number(p.minRating)) && Number(p.minRating) > 0 ? Math.min(Number(p.minRating), 8.5) : undefined,
    sortBy: p.sortBy === "vote_average.desc" || p.sortBy === "popularity.desc" ? p.sortBy : undefined,
  };
  const buf = (Array.isArray(o.buf) ? o.buf : []).slice(0, 80).map(cleanItem).filter((x): x is Item => x !== null);
  return { pass, page, plan, kw: ints(o.kw, 3), sd: ints(o.sd, 12), buf, done: o.done === true };
}

/* ---------- The user's taste: ids only. Favorites, likes and dislikes become ranking signals; all of them, plus watched, are excluded. ---------- */
interface Taste { favorites: number[]; likes: number[]; dislikes: number[]; watched: number[] }
function cleanTaste(t: unknown): Taste {
  const o = (t ?? {}) as Record<string, unknown>;
  return { favorites: ints(o.favorites, 200), likes: ints(o.likes, 200), dislikes: ints(o.dislikes, 200), watched: ints(o.watched, 600) };
}

/** The ranking signals: the newest favorites, likes and dislikes, plus the "loved" / this-or-that picks. Their details are cached. */
async function buildSignals(taste: Taste, seedIds: number[]): Promise<Signal[]> {
  const wanted: { kind: Signal["kind"]; id: number }[] = [
    ...taste.favorites.slice(0, 15).map((id) => ({ kind: "favorite" as const, id })),
    ...taste.likes.slice(0, 15).map((id) => ({ kind: "like" as const, id })),
    ...taste.dislikes.slice(0, 10).map((id) => ({ kind: "dislike" as const, id })),
    ...seedIds.slice(0, 12).map((id) => ({ kind: "seed" as const, id })),
  ];
  const details = await mapLimit(wanted, 12, (w) => loadDetail(w.id));
  return wanted.flatMap((w, i) => (details[i] ? [{ kind: w.kind, f: details[i]!.f }] : []));
}

async function search(
  a: Answers,
  g: Map<number, string>,
  resume: { cursor: Cursor; seen: number[] } | null,
  userKey: string | null | undefined,
  taste: Taste
): Promise<{ movies: Movie[]; cursor: Cursor | null }> {
  const cfg = rankConfig();
  // Never offered again: what was shown, and what the user disliked, liked, favorited or watched.
  const seen = new Set<number>([...(resume?.seen ?? []), ...taste.dislikes, ...taste.likes, ...taste.favorites, ...taste.watched]);
  let plan: Plan;
  let kw: number[];
  let next: { pass: number; page: number } | null;
  let seedIds: number[] = [];
  let seedCandidates: TmdbMovie[] = [];
  let agree = new Map<number, number>();
  let pool: Item[] = [];

  if (resume) {
    ({ plan, kw } = resume.cursor);
    next = resume.cursor.done ? null : { pass: resume.cursor.pass, page: resume.cursor.page };
    seedIds = resume.cursor.sd;
    pool = resume.cursor.buf.filter((it) => !seen.has(it.movie.id)); // anything excluded since it was buffered drops out
    for (const it of pool) seen.add(it.movie.id);
  } else {
    plan = rulePlan(a);
    kw = [];

    // "A movie you loved" and the this-or-that movie picks are extra positive signals, and their TMDB recommendations join the candidates.
    const seeds = [String(a.loved ?? "").trim(), ...asList(a.seeds)].filter(Boolean);
    if (seeds.length) {
      plan = enforce(plan, a);
      const r = await fromSeeds(seeds, a, plan);
      seedIds = r.seeds.map((m) => m.id);
      seedCandidates = r.candidates;
      agree = r.agree;
      for (const id of seedIds) seen.add(id);
    }
    if (!seedIds.length) {
      const explicit = asList(a.genres).length > 0 || a.who === "kids";
      const ai = await geminiPlan(a, g, explicit, userKey);
      if (ai) plan = mergePlan(plan, ai);
      plan = enforce(plan, a);
      if (plan.keywords.length) kw = await keywordIds(plan.keywords);
    }
    const startPage = a.novelty === "familiar" ? 1 : 1 + Math.floor(Math.random() * 3); // variety between searches
    next = { pass: 0, page: startPage };
  }

  const params = baseParams(a, plan);
  const actor = String(a.actor ?? "").trim();
  if (actor) {
    const s = await tmdb<{ results: { id: number }[] }>("/search/person", { query: actor });
    if (s.results[0]) params.with_cast = s.results[0].id;
  }
  const passes = buildPasses(a, plan, params, kw);
  const accept = movieFilter(a);
  const gap = ratingGap(a);
  const verify = gap ? (list: TmdbMovie[]) => keepRated(list, gap) : undefined;

  // Fill the pool in batches of 50 until there are enough candidates to rank and diversify.
  // With fewer than a page available, the exploration budget lets it fetch up to maxBatches batches.
  let batches = 0;
  const signalsPromise = buildSignals(taste, seedIds); // runs while TMDB is being searched
  const seedFresh = seedCandidates.filter((m) => !seen.has(m.id)); // recommended for the picks: always part of the first batch
  for (const m of seedFresh) seen.add(m.id);
  while (pool.length < cfg.refillBelow && next && batches < (pool.length >= cfg.page ? 1 : cfg.maxBatches)) {
    const r = await collect(passes, next, seen, { target: cfg.batch, maxScan: resume ? 10 : MAX_PAGES, allowGeneric: false, accept, verify });
    next = r.next;
    const fresh = batches === 0 ? [...seedFresh, ...r.found] : r.found;
    batches++;
    const unique = [...new Map(fresh.map((m) => [m.id, m])).values()];
    for (const m of unique) seen.add(m.id);
    const items = await hydrate(unique, g);
    for (const it of items) if (agree.has(it.movie.id)) it.b = agree.get(it.movie.id);
    pool.push(...items);
  }

  const signals = await signalsPromise;
  const ask = { must: plan.mustHave, any: plan.anyOf }; // the genres the user asked for
  const ranked = scorePool(pool, signals, cfg, ask);
  for (const r of ranked) r.base += cfg.seedBoost * (r.item.b ?? 0); // movies TMDB recommends for the "loved" picks rank higher
  const { page, rest } = selectPage(ranked, cfg, ask);
  const buf = rest.slice(0, cfg.buffer).map((r) => r.item);
  const done = next === null;
  return {
    movies: page.map((r) => r.item.movie),
    cursor: done && !buf.length ? null : { pass: next?.pass ?? 0, page: next?.page ?? 1, plan, kw, sd: seedIds, buf, done },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.mode === "cast") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) throw new Error("Invalid movie id");
      const c = await tmdb<{ cast: { name: string; character: string }[] }>(`/movie/${id}/credits`);
      return Response.json({ cast: c.cast.slice(0, 10).map(({ name, character }) => ({ name, character })) });
    }
    if (body.mode === "trailer") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) throw new Error("Invalid movie id");
      const v = await tmdb<{ results: { key: string; site: string; type: string; official: boolean }[] }>(`/movie/${id}/videos`);
      const yt = v.results.filter((x) => x.site === "YouTube");
      const best =
        yt.find((x) => x.type === "Trailer" && x.official) ?? yt.find((x) => x.type === "Trailer") ?? yt.find((x) => x.type === "Teaser");
      return Response.json({ key: best?.key ?? null });
    }
    if (body.mode === "movie") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) throw new Error("Invalid movie id");
      const m = await tmdb<TmdbMovie & ExtrasPayload & { genres: { id: number; name: string }[] }>(`/movie/${id}`, EXTRAS);
      return Response.json({
        movie: { ...toMovie(m, new Map()), genres: m.genres.map((x) => x.name), ...pickExtras(m) },
      });
    }
    const g = await genreMap();
    const cursor = body.mode === "more" ? cleanCursor(body.cursor) : null;
    // A signed-in user with their own Gemini key uses it for the search refinement; everyone else uses the server key.
    // A signed-in user with their own Gemini key uses it for the search fine-tuning; everyone else uses the server key.
    const userKey = await userGeminiKey(request);
    const result = await search(
      body.answers ?? {},
      g,
      cursor ? { cursor, seen: ints(body.seen, 1000) } : null,
      userKey,
      cleanTaste(body.taste)
    );
    return Response.json({ movies: result.movies, cursor: result.cursor });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
}
