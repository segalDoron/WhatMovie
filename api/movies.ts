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
async function askGemini(input: string): Promise<{ title: string; year?: number }[]> {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'Reply only with a JSON array of 12 real movies: [{"title": string, "year": number}].' }],
      },
      contents: [{ role: "user", parts: [{ text: `what movie should I watch based on: ${input}` }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
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

/* ---------- Questions: map answers to TMDB discover filters ---------- */
const MOOD: Record<string, string> = {
  laugh: "35", thrilled: "53|28", moved: "18|10749", mindbent: "878|9648", comforted: "10751|16|35",
};
const AVOID: Record<string, number> = { horror: 27, war: 10752, romance: 10749 };

async function fromAnswers(a: Record<string, string | string[]>, g: Map<number, string>): Promise<Movie[]> {
  // A loved movie takes priority: use TMDB's "similar" recommendations.
  const loved = String(a.loved ?? "").trim();
  if (loved) {
    const s = await tmdb<{ results: TmdbMovie[] }>("/search/movie", { query: loved });
    if (s.results[0]) {
      const r = await tmdb<{ results: TmdbMovie[] }>(`/movie/${s.results[0].id}/recommendations`);
      if (r.results.length) return r.results.slice(0, 20).map((m) => toMovie(m, g));
    }
  }

  const p: Record<string, string | number> = {
    "vote_count.gte": 300,
    watch_region: process.env.WATCH_REGION ?? "US",
  };
  if (a.who === "kids") {
    p.with_genres = "10751|16";
    p.certification_country = "US";
    p["certification.lte"] = "PG";
  } else if (MOOD[String(a.mood)]) p.with_genres = MOOD[String(a.mood)];

  if (a.time === "short") p["with_runtime.lte"] = 90;
  if (a.time === "medium") { p["with_runtime.gte"] = 85; p["with_runtime.lte"] = 130; }
  p["vote_average.gte"] = a.energy === "focus" ? 7.3 : 6.3;

  if (a.novelty === "familiar") { p.sort_by = "vote_average.desc"; p["vote_count.gte"] = 5000; }
  else { p.sort_by = "popularity.desc"; p.page = 1 + Math.floor(Math.random() * 3); }

  if (a.platform && a.platform !== "any") p.with_watch_providers = String(a.platform);
  if (a.language === "en") p.with_original_language = "en";
  if (a.era === "classic") p["primary_release_date.lte"] = "1999-12-31";
  if (a.era === "recent") p["primary_release_date.gte"] = "2015-01-01";

  const no = ((a.avoid as string[]) ?? []).map((k) => AVOID[k]).filter(Boolean);
  if (no.length) p.without_genres = no.join(",");

  let r = await tmdb<{ results: TmdbMovie[] }>("/discover/movie", p);
  if (r.results.length < 10) {
    // Too strict: relax the quality filters and go back to the first page.
    p.page = 1;
    p["vote_count.gte"] = 100;
    delete p["vote_average.gte"];
    r = await tmdb<{ results: TmdbMovie[] }>("/discover/movie", p);
  }
  return r.results.slice(0, 20).map((m) => toMovie(m, g));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
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
