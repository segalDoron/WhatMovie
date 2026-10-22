// Personalized ranking and diversity. Pure functions: no network. Weights and limits live in DEFAULT_RANK
// (override any of them with a RANK_CONFIG JSON environment variable, e.g. {"weights":{"taste":0.5}}).

/** Everything the ranking needs to know about one movie. Small enough to travel in a cursor. */
export interface Features {
  id: number;
  g: number[]; // genre ids, the first one is the primary genre
  k: number[]; // keyword ids (themes, plot, tone)
  c: number[]; // top cast ids, lead actor first
  d: number[]; // director ids
  y: number; // release year
  l: string; // original language
  col: number; // franchise (TMDB collection) id, 0 = none
  va: number; // vote average
  vc: number; // vote count
  pop: number; // TMDB popularity
}

export type SignalKind = "favorite" | "like" | "dislike" | "seed";
export interface Signal { kind: SignalKind; f: Features }

export interface RankConfig {
  weights: { taste: number; favorite: number; quality: number; dislike: number; discovery: number; fit: number };
  signal: { favorite: number; like: number; dislike: number; seed: number };
  feature: { g: number; k: number; d: number; c: number; y: number; l: number };
  ramp: { taste: number; favorite: number; dislike: number }; // how much history gives a component its full weight
  quality: { minVotes: number; mean: number; low: number; high: number };
  dislikeRiskAt: number; // similarity to a disliked movie that counts as maximum risk
  seedBoost: number; // points added to movies TMDB recommends for the "loved" / this-or-that picks
  page: number;
  discoveryShare: number;
  discoveryRelevanceGap: number; // a discovery must score within this many points of the typical strong match
  similarityPenalty: number;
  strongerGap: number; // points: diversity may only pass over a movie if a replacement is this close
  caps: { genre: number; theme: number; franchise: number; person: number };
  themeJaccard: number;
  decadeShare: number;
  batch: number; // TMDB candidates fetched per batch
  refillBelow: number; // fetch another batch when fewer candidates are buffered
  maxBatches: number; // exploration budget per request when fewer than a page is available
  buffer: number; // ranked movies kept for the next pages
}

export const DEFAULT_RANK: RankConfig = {
  // fit = how exactly a movie matches the genres the user asked for (a comedy-only movie beats a comedy-action one).
  weights: { taste: 0.3, favorite: 0.15, quality: 0.25, dislike: 0.1, discovery: 0.05, fit: 0.15 },
  signal: { favorite: 5, like: 2, dislike: -4, seed: 3 },
  feature: { g: 1, k: 1, d: 0.8, c: 0.6, y: 0.3, l: 0.3 },
  ramp: { taste: 20, favorite: 3, dislike: 2 },
  quality: { minVotes: 500, mean: 6.5, low: 5, high: 9 },
  dislikeRiskAt: 0.6,
  seedBoost: 10,
  page: 20,
  discoveryShare: 0.2,
  discoveryRelevanceGap: 15,
  similarityPenalty: 0.15,
  strongerGap: 30,
  caps: { genre: 5, theme: 3, franchise: 2, person: 3 },
  themeJaccard: 0.5,
  decadeShare: 0.6,
  batch: 50,
  refillBelow: 40,
  maxBatches: 3,
  buffer: 60,
};

/** DEFAULT_RANK with any valid numbers from the RANK_CONFIG environment variable laid over it. */
export function rankConfig(raw: string | undefined = process.env.RANK_CONFIG): RankConfig {
  if (!raw) return DEFAULT_RANK;
  try {
    const over = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, unknown> = { ...DEFAULT_RANK };
    for (const [key, base] of Object.entries(DEFAULT_RANK)) {
      const v = over[key];
      if (typeof base === "number") {
        if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
      } else if (v && typeof v === "object") {
        const merged: Record<string, number> = { ...(base as Record<string, number>) };
        for (const [k2, n] of Object.entries(v as Record<string, unknown>)) {
          if (k2 in merged && typeof n === "number" && Number.isFinite(n)) merged[k2] = n;
        }
        out[key] = merged;
      }
    }
    return out as unknown as RankConfig;
  } catch {
    return DEFAULT_RANK;
  }
}

/* ---------- Feature vectors ---------- */
type Vec = Map<string, number>;

/** Each feature group (genres, keywords, ...) has the same total weight, however many entries it has. */
function vectorOf(f: Features, cfg: RankConfig): Vec {
  const v: Vec = new Map();
  const group = (prefix: string, ids: (number | string)[], weight: number) => {
    if (!ids.length) return;
    const each = weight / Math.sqrt(ids.length);
    for (const id of ids) v.set(prefix + id, each);
  };
  group("g", f.g, cfg.feature.g);
  group("k", f.k, cfg.feature.k);
  group("d", f.d, cfg.feature.d);
  group("c", f.c.slice(0, 4), cfg.feature.c);
  if (f.y) group("y", [Math.floor(f.y / 10)], cfg.feature.y);
  if (f.l) group("l", [f.l], cfg.feature.l);
  return v;
}

const dot = (a: Vec, b: Vec): number => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [k, x] of small) {
    const y = big.get(k);
    if (y !== undefined) s += x * y;
  }
  return s;
};
const norm = (a: Vec): number => Math.sqrt(dot(a, a));
const cosine = (a: Vec, b: Vec): number => {
  const d = norm(a) * norm(b);
  return d > 1e-12 ? dot(a, b) / d : 0;
};
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Scales a list to 0..1. When every value is the same there is nothing to tell apart, so the result is neutral (0.5). */
function normalize(values: number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return hi - lo < 1e-9 ? values.map(() => 0.5) : values.map((x) => (x - lo) / (hi - lo));
}

/* ---------- Scoring ---------- */
export interface Ranked<T> {
  item: T;
  f: Features;
  base: number; // 0..100
  discovery: number; // 0..1
  parts: { taste: number; favorite: number; quality: number; dislike: number; discovery: number; fit: number };
  vec: Vec;
}

export function qualityOf(f: Features, cfg: RankConfig): number {
  if (!f.vc && !f.va) return 0.5; // missing data is neutral
  const { minVotes, mean, low, high } = cfg.quality;
  const adjusted = (f.vc / (f.vc + minVotes)) * f.va + (minVotes / (f.vc + minVotes)) * mean; // few votes pull toward the average
  return clamp01((adjusted - low) / (high - low));
}

/**
 * Scores every movie in the pool from 0 to 100:
 * taste similarity, favorite similarity, quality, dislike avoidance and discovery potential, with the configured weights.
 * Dislikes only lower similarity; they never remove a genre. Components without data are neutral (0.5), and the weight of
 * the personal components grows with the amount of history, the rest going to quality.
 */
/** The genres the user asked for: every one of `must` is required, at least one of `any` is. Empty = no genre filter. */
export interface GenreAsk { must: number[]; any: number[] }

/** 1 when the movie is exactly what was asked (only the requested genres), less the more other genres it carries. */
export function fitOf(f: Features, ask: GenreAsk): number {
  const wanted = new Set([...ask.must, ...ask.any]);
  if (!wanted.size || !f.g.length) return 0.5; // no genre filter, or no data: neutral
  const hit = f.g.filter((x) => wanted.has(x)).length;
  const coverage = ask.must.length ? ask.must.filter((x) => f.g.includes(x)).length / ask.must.length : Math.min(1, hit / Math.min(2, ask.any.length));
  return clamp01(coverage * (hit / f.g.length));
}

export function scorePool<T extends { f: Features }>(items: T[], signals: Signal[], cfg: RankConfig = DEFAULT_RANK, ask: GenreAsk = { must: [], any: [] }): Ranked<T>[] {
  if (!items.length) return [];
  const vecs = items.map((i) => vectorOf(i.f, cfg));
  const sig = signals.map((s) => ({ kind: s.kind, vec: vectorOf(s.f, cfg) }));

  const taste: Vec = new Map();
  const fav: Vec = new Map();
  for (const s of sig) {
    for (const [k, x] of s.vec) {
      taste.set(k, (taste.get(k) ?? 0) + x * cfg.signal[s.kind]);
      if (s.kind === "favorite") fav.set(k, (fav.get(k) ?? 0) + x);
    }
  }
  const dislikes = sig.filter((s) => s.kind === "dislike");
  const favCount = sig.filter((s) => s.kind === "favorite").length;
  const strength = signals.reduce((sum, s) => sum + Math.abs(cfg.signal[s.kind]), 0);

  const tasteRaw = vecs.map((v) => (sig.length ? Math.max(0, cosine(v, taste)) : 0));
  const favRaw = vecs.map((v) => (favCount ? cosine(v, fav) : 0));
  const tasteN = sig.length ? normalize(tasteRaw) : vecs.map(() => 0.5);
  const favN = favCount ? normalize(favRaw) : vecs.map(() => 0.5);
  // The risk is the closest single disliked movie, so one disliked comedy only hurts movies that really resemble it.
  const avoid = vecs.map((v) => (dislikes.length ? 1 - clamp01(Math.max(...dislikes.map((d) => cosine(v, d.vec))) / cfg.dislikeRiskAt) : 0.5));
  const quality = items.map((i) => qualityOf(i.f, cfg));

  const known = new Set<string>();
  for (const s of sig) for (const k of s.vec.keys()) if ("gkdc".includes(k[0])) known.add(k);
  const lowPop = normalize(items.map((i) => Math.log1p(Math.max(0, i.f.pop)))).map((x) => 1 - x);
  const discovery = items.map((_, i) => {
    const keys = [...vecs[i].keys()].filter((k) => "gkdc".includes(k[0]));
    const unseen = sig.length && keys.length ? keys.filter((k) => !known.has(k)).length / keys.length : 0.5;
    return (0.5 * lowPop[i] + 0.5 * unseen) * (0.5 + 0.5 * quality[i]); // obscure but weak movies are not discoveries
  });

  const w = cfg.weights;
  const hasAsk = ask.must.length + ask.any.length > 0;
  const fit = items.map((i) => (hasAsk ? fitOf(i.f, ask) : 0.5));
  const cT = clamp01(strength / cfg.ramp.taste);
  const cF = clamp01(favCount / cfg.ramp.favorite);
  const cD = clamp01(dislikes.length / cfg.ramp.dislike);
  const eff = { taste: w.taste * cT, favorite: w.favorite * cF, dislike: w.dislike * cD };
  const fit_w = hasAsk ? w.fit : 0;
  // Little history, or no genre filter: the weight that is not used goes to quality.
  const quality_w = w.quality + (w.taste - eff.taste) + (w.favorite - eff.favorite) + (w.dislike - eff.dislike) + (w.fit - fit_w);

  return items.map((item, i) => {
    const parts = { taste: tasteN[i], favorite: favN[i], quality: quality[i], dislike: avoid[i], discovery: discovery[i], fit: fit[i] };
    const base =
      100 * (eff.taste * parts.taste + eff.favorite * parts.favorite + quality_w * parts.quality + eff.dislike * parts.dislike + w.discovery * parts.discovery + fit_w * parts.fit);
    return { item, f: item.f, base, discovery: discovery[i], parts, vec: vecs[i] };
  });
}

/* ---------- Diversity ---------- */
const decadeOf = (f: Features): number => (f.y ? Math.floor(f.y / 10) : 0);

function jaccard(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const set = new Set(b);
  let inter = 0;
  for (const x of a) if (set.has(x)) inter++;
  return inter / (a.length + b.length - inter);
}

/** The genre that counts for the per-genre cap: the first one that is not a genre the user asked for (those are the point of the page). */
const primaryOf = (f: Features, skip: Set<number>): number | undefined => f.g.find((x) => !skip.has(x));

function violates<T>(r: Ranked<T>, picked: Ranked<T>[], cfg: RankConfig, skip: Set<number>): boolean {
  const f = r.f;
  const count = (test: (p: Features) => boolean) => picked.reduce((n, p) => n + (test(p.f) ? 1 : 0), 0);
  const primary = primaryOf(f, skip);
  if (primary !== undefined && count((p) => primaryOf(p, skip) === primary) >= cfg.caps.genre) return true; // same primary genre
  if (f.col && count((p) => p.col === f.col) >= cfg.caps.franchise) return true; // same franchise
  for (const id of [...f.d, ...(f.c.length ? [f.c[0]] : [])]) {
    if (count((p) => p.d.includes(id) || p.c[0] === id) >= cfg.caps.person) return true; // same lead actor or director
  }
  if (f.k.length >= 3 && count((p) => p.k.length >= 3 && jaccard(p.k, f.k) >= cfg.themeJaccard) >= cfg.caps.theme) return true; // very similar themes
  const dec = decadeOf(f);
  if (dec && count((p) => decadeOf(p) === dec) >= Math.ceil(cfg.decadeShare * cfg.page)) return true; // one decade crowding the page
  return false;
}

/**
 * Next movie to take. `remaining` is sorted best first by `key`. Only movies within `strongerGap` points of the best one
 * can be preferred for diversity (a similarity penalty and the caps), so a much stronger movie is never passed over.
 * If every movie in that window breaks a cap, the best one is taken anyway: the caps relax instead of leaving the page short.
 */
function chooseNext<T>(remaining: Ranked<T>[], picked: Ranked<T>[], cfg: RankConfig, key: (r: Ranked<T>) => number, skip: Set<number>): Ranked<T> {
  const top = remaining[0];
  const floor = key(top) - cfg.strongerGap;
  let best: Ranked<T> | null = null;
  let bestScore = -Infinity;
  for (const r of remaining) {
    if (key(r) < floor) break;
    if (violates(r, picked, cfg, skip)) continue;
    let sim = 0;
    for (const p of picked) sim = Math.max(sim, cosine(r.vec, p.vec));
    const adjusted = key(r) * (1 - cfg.similarityPenalty * sim);
    if (adjusted > bestScore) {
      best = r;
      bestScore = adjusted;
    }
  }
  return best ?? top;
}

/**
 * Picks one page (20) from the pool: about 80% strong matches chosen relevance-first with the diversity rules, and about 20%
 * relevant discoveries placed at every fifth position. Everything not picked comes back ranked, for the next pages.
 */
export function selectPage<T>(pool: Ranked<T>[], cfg: RankConfig = DEFAULT_RANK, ask: GenreAsk = { must: [], any: [] }): { page: Ranked<T>[]; rest: Ranked<T>[] } {
  const skip = new Set([...ask.must, ...ask.any]);
  const byBase = [...pool].sort((a, b) => b.base - a.base || a.f.id - b.f.id);
  const n = cfg.page;
  if (byBase.length <= n) return { page: byBase, rest: [] };

  const discoveryN = Math.round(n * cfg.discoveryShare);
  const strongN = n - discoveryN;
  let remaining = byBase;
  const strong: Ranked<T>[] = [];
  while (strong.length < strongN) {
    const r = chooseNext(remaining, strong, cfg, (x) => x.base, skip);
    strong.push(r);
    remaining = remaining.filter((x) => x !== r);
  }

  const bases = strong.map((s) => s.base).sort((a, b) => a - b);
  const typical = bases[Math.floor(bases.length / 2)] ?? 0;
  const dKey = (x: Ranked<T>) => 0.5 * x.base + 50 * x.discovery;
  const disc: Ranked<T>[] = [];
  while (disc.length < discoveryN && remaining.length) {
    const relevant = remaining.filter((x) => x.base >= typical - cfg.discoveryRelevanceGap).sort((a, b) => dKey(b) - dKey(a) || a.f.id - b.f.id);
    const useDisc = relevant.length > 0;
    const r = chooseNext(useDisc ? relevant : remaining, [...strong, ...disc], cfg, useDisc ? dKey : (x) => x.base, skip);
    disc.push(r);
    remaining = remaining.filter((x) => x !== r);
  }

  const page = [...strong].sort((a, b) => b.base - a.base || a.f.id - b.f.id);
  disc.forEach((d, i) => page.splice(Math.min((i + 1) * 5 - 1, page.length), 0, d)); // positions 5, 10, 15, 20
  return { page, rest: remaining };
}
