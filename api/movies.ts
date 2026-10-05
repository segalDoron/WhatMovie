// Vercel serverless function. API keys stay on the server (env vars).
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

interface TmdbMovie {
  id: number; title: string; release_date?: string; vote_average: number;
  poster_path: string | null; backdrop_path: string | null; overview: string; genre_ids?: number[];
}
interface Movie {
  id: number; title: string; genres: string[]; year: string; score: number;
  poster: string | null; backdrop: string | null; overview: string; rating: string;
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
});

/* Age rating for the viewer's region (falls back to the US). Empty string when TMDB has none. */
async function certification(id: number): Promise<string> {
  try {
    const r = await tmdb<{ results: { iso_3166_1: string; release_dates: { certification: string }[] }[] }>(`/movie/${id}/release_dates`);
    const find = (country: string) =>
      r.results.find((x) => x.iso_3166_1 === country)?.release_dates.find((d) => d.certification)?.certification ?? "";
    return find(process.env.WATCH_REGION ?? "US") || find("US");
  } catch {
    return "";
  }
}

async function withRatings(movies: Movie[]): Promise<Movie[]> {
  await Promise.all(movies.map(async (m) => { m.rating = await certification(m.id); }));
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
// Tone works by excluding genres that clash with it.
const TONE_EXCLUDE: Record<string, number[]> = { dark: [35, 10751], serious: [35, 10751], light: [27, 53, 80], funny: [27, 53, 80] };
// "This or that" taste picks that can be expressed as genres.
const TASTE_GENRES: Record<string, number[]> = {
  laugh: [35], tense: [53], think: [9648, 878], feel: [18, 10749], shocking: [9648, 53], action: [28], slow: [18, 9648],
};

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];

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

  if (a.who === "kids") plan.anyOf = [FAMILY, ANIMATION];
  else if (ids.length || picked.includes("crazynight")) {
    if (ids.includes(HORROR)) plan.mustHave.push(HORROR); // scary means Horror, never "action with scares"
    const rest = ids.filter((i) => i !== HORROR);
    if (rest.length && rest.length <= 2) plan.mustHave.push(...rest); // a blend, e.g. horror comedy
    else if (rest.length) plan.anyOf = rest;
    if (!plan.mustHave.length && !plan.anyOf.length) plan.anyOf = [35, 80]; // "one crazy night"
  } else {
    const mood = MOOD[String(a.mood)];
    const taste = unique(asList(a.taste).flatMap((k) => TASTE_GENRES[k] ?? []));
    if (mood) { plan.mustHave = mood.must ?? []; plan.anyOf = mood.any ?? []; }
    else if (taste.length) plan.anyOf = taste;
    else if (a.tone === "funny") plan.mustHave = [35];
  }
  plan.exclude = [...(TONE_EXCLUDE[String(a.tone)] ?? [])];
  return plan;
}

/** Rules that always apply, whatever Gemini said. */
function enforce(plan: Plan, a: Answers): Plan {
  const picked = asList(a.genres);
  const allowAnimation = picked.includes("animation") || a.who === "kids";
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
    '- "excludeGenres" lists genres that clash with the requested mood or tone.',
    "- Never include Animation unless the user asked for animation or kids are watching.",
    '- "keywords": at most 3 short TMDB keywords for a specific theme the user clearly implied (for example "twist ending", "slasher"), otherwise [].',
    "- Form keys: who (solo, partner, friends, kids), mood, genres, tone (dark to funny), time, novelty, energy, taste (picks such as laugh, tense, think, feel, shocking, slow, gem, classic), loved (a movie they like), actor.",
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
  if (a.who === "kids") { p.certification_country = "US"; p["certification.lte"] = "PG"; }
  if (a.time === "short") p["with_runtime.lte"] = 90;
  if (a.time === "medium") { p["with_runtime.gte"] = 85; p["with_runtime.lte"] = 130; }
  if (a.novelty === "familiar") { p.sort_by = "vote_average.desc"; p["vote_count.gte"] = 5000; }
  if (taste.includes("gem")) { p["vote_count.gte"] = 300; p["vote_count.lte"] = 4000; p["vote_average.gte"] = 7; p.sort_by = "vote_average.desc"; }
  if (taste.includes("classic")) { p["vote_count.gte"] = 8000; p.sort_by = "vote_average.desc"; }

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
 * Page loop: keep fetching TMDB pages, filter each batch, and collect unique valid movies until TARGET.
 * - seenIds: every movie ID already looked at, so repeats never show up across pages (or passes).
 * - tmdbPage: the page pointer; each fetch continues where the previous one finished.
 * Pass 1 is strict (quality + Gemini keywords). Pass 2 relaxes quality and keywords only; genre rules never relax.
 */
async function collect(plan: Plan, base: Params, keywordIds: number[], startPage: number): Promise<TmdbMovie[]> {
  const seenIds = new Set<number>();
  const found: TmdbMovie[] = [];
  const passes: Params[] = [
    keywordIds.length ? { ...base, with_keywords: keywordIds.join("|") } : base,
    { ...base, "vote_count.gte": 100, "vote_average.gte": 0 },
  ];

  for (const [i, params] of passes.entries()) {
    let tmdbPage = i === 0 ? startPage : 1;
    let scanned = 0;
    while (found.length < TARGET && scanned < MAX_PAGES) {
      const r = await tmdb<DiscoverPage>("/discover/movie", { ...params, page: tmdbPage });
      scanned++;
      if (tmdbPage > r.total_pages) {
        if (tmdbPage === 1 || r.total_pages < 1) break;
        tmdbPage = 1; // the random start was past the last page
        continue;
      }
      for (const m of r.results) {
        if (seenIds.has(m.id)) continue;
        seenIds.add(m.id);
        if (isValid(m, plan)) found.push(m);
        if (found.length >= TARGET) break;
      }
      if (tmdbPage >= r.total_pages) break; // no more pages
      tmdbPage++;
    }
    if (found.length >= TARGET) break;
  }
  return found.slice(0, TARGET);
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
  const ranked = [...tally.values()].sort((x, y) => y.n - x.n || y.m.vote_average - x.m.vote_average).map((e) => e.m);

  const { from, to } = yearRange(a);
  const inYears = (m: TmdbMovie) => {
    const y = Number(m.release_date?.slice(0, 4));
    return !((from && y && y < from) || (to && y && y > to));
  };
  const strict = ranked.filter((m) => inYears(m) && isValid(m, plan));
  if (strict.length >= 8) return strict.slice(0, TARGET);
  // Too few: keep only the always-on rules (no cartoons, documentaries or skipped genres).
  const always = { ...plan, mustHave: [], anyOf: [], exclude: plan.exclude.filter((g) => [ANIMATION, DOCUMENTARY, TV_MOVIE, ...asList(a.avoid).map((k) => AVOID[k])].includes(g)) };
  return ranked.filter((m) => inYears(m) && isValid(m, always)).slice(0, TARGET);
}

async function fromAnswers(a: Answers, g: Map<number, string>): Promise<Movie[]> {
  let plan = rulePlan(a);

  // Movie picks take priority; year, genre rules and the no-cartoons rule still apply.
  const seeds = [String(a.loved ?? "").trim(), ...asList(a.seeds)].filter(Boolean);
  if (seeds.length) {
    const r = await fromSeeds(seeds, a, enforce(plan, a));
    if (r.length) return r.map((m) => toMovie(m, g));
  }

  const explicit = asList(a.genres).length > 0 || a.who === "kids";
  const ai = await geminiPlan(a, g, explicit);
  if (ai) plan = mergePlan(plan, ai);
  plan = enforce(plan, a);

  const params = baseParams(a, plan);
  const actor = String(a.actor ?? "").trim();
  if (actor) {
    const s = await tmdb<{ results: { id: number }[] }>("/search/person", { query: actor });
    if (s.results[0]) params.with_cast = s.results[0].id;
  }
  const kw = plan.keywords.length ? await keywordIds(plan.keywords) : [];
  const startPage = a.novelty === "familiar" ? 1 : 1 + Math.floor(Math.random() * 3); // variety between searches
  const movies = await collect(plan, params, kw, startPage);
  return movies.map((m) => toMovie(m, g));
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
      const m = await tmdb<TmdbMovie & { genres: { id: number; name: string }[] }>(`/movie/${id}`);
      return Response.json({
        movie: { ...toMovie(m, new Map()), genres: m.genres.map((x) => x.name), rating: await certification(id) },
      });
    }
    const g = await genreMap();
    const movies = await withRatings(await fromAnswers(body.answers ?? {}, g));
    return Response.json({ movies });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
}
