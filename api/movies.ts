// Vercel serverless function. API keys stay on the server (env vars).
const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

interface TmdbMovie {
  id: number; title: string; release_date?: string; vote_average: number;
  poster_path: string | null; backdrop_path: string | null; overview: string; genre_ids?: number[];
}
interface Movie {
  id: number; title: string; genres: string[]; year: string; score: number;
  poster: string | null; backdrop: string | null; overview: string;
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
});

/* ---------- Free text: Gemini suggests titles, TMDB supplies the data ---------- */
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
let cachedModel: string | undefined;

const geminiKey = () => process.env.GEMINI_API_KEY ?? "";

async function callGemini(model: string, input: string): Promise<Response> {
  return fetch(`${GEMINI}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'Reply only with a JSON array of 12 real movies: [{"title": string, "year": number}].' }],
      },
      contents: [{ role: "user", parts: [{ text: `what movie should I watch based on: ${input}` }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
}

async function errMessage(res: Response): Promise<string> {
  try {
    return (await res.json())?.error?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

// Model names get retired often, so ask the API which text models this key can use.
async function listTextModels(): Promise<string[]> {
  const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": geminiKey() } });
  if (!res.ok) return [];
  const data = await res.json();
  const skip = /image|tts|live|audio|embed|imagen|veo|lyria|robotics|computer|learnlm|gemma|deep-research|native|exp/i;
  const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return ((data.models ?? []) as { name: string; supportedGenerationMethods?: string[] }[])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /flash/i.test(m.name) && !skip.test(m.name))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort((a, b) => Number(/preview/.test(a)) - Number(/preview/.test(b)) || version(b) - version(a));
}

async function askGemini(input: string): Promise<{ title: string; year?: number }[]> {
  const queue = [process.env.GEMINI_MODEL, cachedModel].filter(Boolean) as string[];
  const tried: string[] = [];
  let listed = false;
  let lastError = "";

  while (tried.length < 5) {
    if (!queue.length) {
      if (listed) break;
      listed = true;
      queue.push(...(await listTextModels()));
      if (!queue.length) break;
    }
    const model = queue.shift()!;
    if (tried.includes(model)) continue;
    tried.push(model);

    const res = await callGemini(model, input);
    if (res.ok) {
      cachedModel = model;
      const data = await res.json();
      try {
        return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
      } catch {
        return [];
      }
    }
    if (model === cachedModel) cachedModel = undefined;
    lastError = `Gemini ${res.status} (${model}): ${await errMessage(res)}`;
    if (![404, 403, 429].includes(res.status)) break; // only try another model for these
  }
  throw new Error(lastError || "Gemini: no usable model found for this API key");
}

async function fromText(input: string, g: Map<number, string>): Promise<Movie[]> {
  const picks = await askGemini(input);
  const found = await Promise.all(
    picks.map(async ({ title, year }) => {
      let r = await tmdb<{ results: TmdbMovie[] }>("/search/movie", { query: title, ...(year ? { year } : {}) });
      if (!r.results.length && year) r = await tmdb("/search/movie", { query: title });
      return r.results[0];
    })
  );
  return found.filter(Boolean).map((m) => toMovie(m, g));
}

/* ---------- Questions: map answers to TMDB filters ---------- */
type Answers = Record<string, string | string[]>;

const MOOD: Record<string, string> = {
  laugh: "35", thrilled: "53|28", moved: "18|10749", mindbent: "878|9648", comforted: "10751|16|35",
  twists: "9648|53", mystery: "9648",
};
const GENRE: Record<string, string> = {
  horror: "27", comedy: "35", scifi: "878", action: "28", drama: "18", thriller: "53",
  romance: "10749", animation: "16", fantasy: "14", crime: "80", crazynight: "35|12|80",
};
const AVOID: Record<string, number> = { horror: 27, war: 10752, romance: 10749 };
// Tone works by excluding genres that clash with it.
const TONE_EXCLUDE: Record<string, number[]> = {
  dark: [35, 10751, 16], serious: [35, 10751], light: [27, 53, 80], funny: [27, 53, 80],
};
// "This or that" taste picks that can be expressed as a genre.
const TASTE_GENRES: Record<string, string> = {
  laugh: "35", tense: "53", think: "9648|878", feel: "18|10749", shocking: "9648|53", action: "28", slow: "18|9648",
};

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

function excludedGenres(a: Answers): number[] {
  const avoid = asList(a.avoid).map((k) => AVOID[k]).filter(Boolean);
  return [...new Set([...avoid, ...(TONE_EXCLUDE[String(a.tone)] ?? [])])];
}

function yearRange(a: Answers) {
  return { from: Number(a.yearFrom) || undefined, to: Number(a.yearTo) || undefined };
}

const parseSeed = (q: string) => {
  const m = q.match(/^(.*)\s\((\d{4})\)$/);
  return m ? { title: m[1], year: m[2] } : { title: q };
};

/* Seed movies ("loved" + this-or-that picks): rank TMDB recommendations by how many seeds agree. */
async function fromSeeds(seeds: string[], a: Answers, g: Map<number, string>): Promise<Movie[]> {
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
  const bad = new Set(excludedGenres(a));
  const ok = (m: TmdbMovie) => {
    const y = Number(m.release_date?.slice(0, 4));
    if (from && y && y < from) return false;
    if (to && y && y > to) return false;
    return !(m.genre_ids ?? []).some((id) => bad.has(id));
  };
  const filtered = ranked.filter(ok);
  return (filtered.length >= 5 ? filtered : ranked).slice(0, 20).map((m) => toMovie(m, g));
}

async function fromAnswers(a: Answers, g: Map<number, string>): Promise<Movie[]> {
  // Movie picks take priority; year, skipped genres and tone still apply.
  const seeds = [String(a.loved ?? "").trim(), ...asList(a.seeds)].filter(Boolean);
  if (seeds.length) {
    const r = await fromSeeds(seeds, a, g);
    if (r.length) return r;
  }

  const taste = asList(a.taste);
  const p: Record<string, string | number> = {
    "vote_count.gte": 300,
    watch_region: process.env.WATCH_REGION ?? "US",
  };

  // Genre precedence: kids > chosen genres > mood > taste picks > "humorous" tone.
  const chosen = asList(a.genres).map((k) => GENRE[k]).filter(Boolean);
  const fromTaste = taste.map((k) => TASTE_GENRES[k]).filter(Boolean);
  if (a.who === "kids") {
    p.with_genres = "10751|16";
    p.certification_country = "US";
    p["certification.lte"] = "PG";
  } else if (chosen.length) p.with_genres = chosen.join("|");
  else if (MOOD[String(a.mood)]) p.with_genres = MOOD[String(a.mood)];
  else if (fromTaste.length) p.with_genres = fromTaste.join("|");
  else if (a.tone === "funny") p.with_genres = "35";

  if (a.time === "short") p["with_runtime.lte"] = 90;
  if (a.time === "medium") { p["with_runtime.gte"] = 85; p["with_runtime.lte"] = 130; }
  p["vote_average.gte"] = a.energy === "focus" ? 7.3 : 6.3;

  if (a.novelty === "familiar") { p.sort_by = "vote_average.desc"; p["vote_count.gte"] = 5000; }
  else { p.sort_by = "popularity.desc"; p.page = 1 + Math.floor(Math.random() * 3); }

  if (taste.includes("gem")) { p["vote_count.gte"] = 300; p["vote_count.lte"] = 4000; p["vote_average.gte"] = 7; p.sort_by = "vote_average.desc"; }
  if (taste.includes("classic")) { p["vote_count.gte"] = 8000; p.sort_by = "vote_average.desc"; }

  // Several services are combined with OR; none selected means anywhere.
  const providers = asList(a.platform).filter((x) => x !== "any");
  if (providers.length) p.with_watch_providers = providers.join("|");

  const { from, to } = yearRange(a);
  if (from) p["primary_release_date.gte"] = `${from}-01-01`;
  if (to) p["primary_release_date.lte"] = `${to}-12-31`;

  const actor = String(a.actor ?? "").trim();
  if (actor) {
    const s = await tmdb<{ results: { id: number }[] }>("/search/person", { query: actor });
    if (s.results[0]) p.with_cast = s.results[0].id;
  }

  const no = excludedGenres(a);
  if (no.length) p.without_genres = no.join(",");

  let r = await tmdb<{ results: TmdbMovie[] }>("/discover/movie", p);
  if (r.results.length < 10) {
    // Too strict: relax the quality filters and go back to the first page.
    p.page = 1;
    p["vote_count.gte"] = 100;
    delete p["vote_count.lte"];
    delete p["vote_average.gte"];
    r = await tmdb<{ results: TmdbMovie[] }>("/discover/movie", p);
  }
  return r.results.slice(0, 20).map((m) => toMovie(m, g));
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
    if (body.mode === "movie") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) throw new Error("Invalid movie id");
      const m = await tmdb<TmdbMovie & { genres: { id: number; name: string }[] }>(`/movie/${id}`);
      return Response.json({ movie: { ...toMovie(m, new Map()), genres: m.genres.map((x) => x.name) } });
    }
    const g = await genreMap();
    const movies =
      body.mode === "text"
        ? await fromText(String(body.input ?? "").slice(0, 80), g)
        : await fromAnswers(body.answers ?? {}, g);
    return Response.json({ movies });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
  }
}
