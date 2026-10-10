// Vercel serverless function. API keys stay on the server (env vars).
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

interface TmdbMovie {
  id: number; title: string; release_date?: string; vote_average: number;
  poster_path: string | null; backdrop_path: string | null; overview: string; genre_ids?: number[];
  original_language?: string;
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

async function withExtras(movies: Movie[]): Promise<Movie[]> {
  await Promise.all(
    movies.map(async (m) => {
      try {
        Object.assign(m, pickExtras(await tmdb<ExtrasPayload>(`/movie/${m.id}`, EXTRAS)));
      } catch {
        /* leave the rating and providers empty */
      }
    })
  );
  return movies;
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

async function listTextModels(signal: AbortSignal): Promise<string[]> {
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" }, signal });
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
async function geminiJson(system: string, user: string): Promise<unknown> {
  if (!process.env.GEMINI_API_KEY) return null;
  const deadline = Date.now() + 6000;
  const signal = () => AbortSignal.timeout(Math.max(500, deadline - Date.now()));
  const queue = [process.env.GEMINI_MODEL, cachedModel].filter(Boolean) as string[];
  const tried: string[] = [];
  let listed = false;
  try {
    while (tried.length < 4 && Date.now() < deadline) {
      if (!queue.length) {
        if (listed) break;
        listed = true;
        queue.push(...(await listTextModels(signal())));
        if (!queue.length) break;
      }
      const model = queue.shift()!;
      if (tried.includes(model)) continue;
      tried.push(model);
      const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
        method: "POST",
        signal: signal(),
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      });
      if (res.ok) {
        cachedModel = model;
        const data = await res.json();
        return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "null");
      }
      if (model === cachedModel) cachedModel = undefined;
      if (![404, 403, 429].includes(res.status)) break; // other models are only tried for these
    }
  } catch {
    /* timeout, network error or invalid JSON: use the rule-based plan */
  }
  return null;
}

async function geminiPlan(a: Answers, genres: Map<number, string>, explicit: boolean): Promise<Partial<Plan> | null> {
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

  const raw = (await geminiJson(system, JSON.stringify(a))) as Record<string, unknown> | null;
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
interface Cursor { pass: number; page: number; plan: Plan; kw: number[] }

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
    if (pass === GENERIC_PASS && !opts.allowGeneric) return { found, next: { pass, page: 1 } };
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

async function fromSeeds(seeds: string[], a: Answers, plan: Plan): Promise<TmdbMovie[]> {
  const found = await Promise.all(
    seeds.slice(0, 12).map(async (q) => {
      const { title, year } = parseSeed(q);
      const s = await tmdb<{ results: TmdbMovie[] }>("/search/movie", { query: title, ...(year ? { year } : {}) });
      return s.results[0];
    })
  );
  const seedMovies = found.filter(Boolean);
  if (!seedMovies.length) return [];
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
  if (strict.length >= 8) return strict.slice(0, TARGET);
  // Too few: keep only the always-on rules (no cartoons, documentaries or skipped genres).
  const always = { ...plan, mustHave: [], anyOf: [], exclude: globalExclude(a) };
  return ranked.filter((m) => inYears(m) && isValid(m, always)).slice(0, TARGET);
}

/* Cursors come back from the browser, so check them before use. */
const ints = (v: unknown, max = 10): number[] => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger).slice(0, max) : []);
function cleanCursor(c: unknown): Cursor | null {
  const o = c as Partial<Cursor> | null;
  if (!o || typeof o !== "object") return null;
  const p = (o.plan ?? {}) as Partial<Plan>;
  const pass = Math.min(Math.max(Number(o.pass) | 0, 0), GENERIC_PASS);
  const page = Math.min(Math.max(Number(o.page) | 0, 1), 500);
  const plan: Plan = {
    mustHave: ints(p.mustHave), anyOf: ints(p.anyOf), exclude: ints(p.exclude, 30), keywords: [],
    minRating: Number.isFinite(Number(p.minRating)) && Number(p.minRating) > 0 ? Math.min(Number(p.minRating), 8.5) : undefined,
    sortBy: p.sortBy === "vote_average.desc" || p.sortBy === "popularity.desc" ? p.sortBy : undefined,
  };
  return { pass, page, plan, kw: ints(o.kw, 3) };
}

async function search(
  a: Answers,
  g: Map<number, string>,
  resume: { cursor: Cursor; seen: number[] } | null
): Promise<{ movies: Movie[]; cursor: Cursor | null }> {
  const seen = new Set<number>(resume?.seen ?? []);
  let plan: Plan;
  let kw: number[];
  let start: { pass: number; page: number };

  if (resume) {
    ({ plan, kw } = resume.cursor);
    start = { pass: resume.cursor.pass, page: resume.cursor.page };
  } else {
    plan = rulePlan(a);
    kw = [];

    // Movie picks take priority; year, genre rules and the no-cartoons rule still apply.
    const seeds = [String(a.loved ?? "").trim(), ...asList(a.seeds)].filter(Boolean);
    if (seeds.length) {
      plan = enforce(plan, a);
      const r = await fromSeeds(seeds, a, plan);
      if (r.length) return { movies: r.map((m) => toMovie(m, g)), cursor: { pass: 0, page: 1, plan, kw } };
    }

    const explicit = asList(a.genres).length > 0 || a.who === "kids";
    const ai = await geminiPlan(a, g, explicit);
    if (ai) plan = mergePlan(plan, ai);
    plan = enforce(plan, a);
    if (plan.keywords.length) kw = await keywordIds(plan.keywords);
    const startPage = a.novelty === "familiar" ? 1 : 1 + Math.floor(Math.random() * 3); // variety between searches
    start = { pass: 0, page: startPage };
  }

  const params = baseParams(a, plan);
  const actor = String(a.actor ?? "").trim();
  if (actor) {
    const s = await tmdb<{ results: { id: number }[] }>("/search/person", { query: actor });
    if (s.results[0]) params.with_cast = s.results[0].id;
  }

  const { found, next } = await collect(buildPasses(a, plan, params, kw), start, seen, {
    target: TARGET,
    maxScan: resume ? 10 : MAX_PAGES,
    allowGeneric: !!resume, // the generic fallback only runs for "show more"
    accept: movieFilter(a),
    verify: (() => { const gap = ratingGap(a); return gap ? (list: TmdbMovie[]) => keepRated(list, gap) : undefined; })(),
  });
  return { movies: found.map((m) => toMovie(m, g)), cursor: next ? { ...next, plan, kw } : null };
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
    const result = await search(
      body.answers ?? {},
      g,
      cursor ? { cursor, seen: ints(body.seen, 600) } : null
    );
    const movies = await withExtras(result.movies);
    return Response.json({ movies, cursor: result.cursor });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
}
