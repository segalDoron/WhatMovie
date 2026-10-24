// Personalized ranking and diversity. Pure functions: no network. Weights and limits live in DEFAULT_RANK
// (override any of them with a RANK_CONFIG JSON environment variable, e.g. {"weights":{"taste":0.5}}).
//
// Order of importance: 1) the genre match with what the user asked for, 2) the personalized score, 3) Gemini's blend, 4) diversity.
// The genre match is worth `tierStep` TMDB rating points per level (strong, compatible, moderate, conflicting), so a better match
// wins when the ratings are within that distance and a clearly higher rating wins when they are further apart.
import { DEFAULT_GENRES, genreRelevance, type GenreAsk, type GenreConfig } from "./_genres.js";
export type { GenreAsk } from "./_genres.js";

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
  weights: { taste: number; favorite: number; quality: number; dislike: number; discovery: number };
  signal: { favorite: number; like: number; dislike: number; seed: number };
  feature: { g: number; k: number; d: number; c: number; y: number; l: number };
  ramp: { taste: number; favorite: number; dislike: number }; // how much history gives a component its full weight
  quality: { minVotes: number; mean: number; low: number; high: number };
  dislikeRiskAt: number; // similarity to a disliked movie that counts as maximum risk
  seedBoost: number; // points added to movies TMDB recommends for the "loved" / this-or-that picks
  page: number;
  discoveryShare: number;
  tierStep: number; // TMDB rating points one genre-match level is worth
  personalSpan: number; // TMDB rating points the personalized score can move a movie (kept under tierStep: genres come first)
  discoveryRelevanceGap: number; // a discovery must rank within this many key points (0.1 rating = 1 point) of the typical strong match
  discoveryPoints: number; // key points a fully "discovery" movie gains when discoveries are chosen
  similarityPenalty: number;
  diversityGap: number; // key points: diversity may only pass over a movie for one of the same (or a better) genre tier within this distance
  caps: { genre: number; theme: number; franchise: number; person: number }; // genre: per page, for each genre the user did not ask for
  themeJaccard: number;
  decadeShare: number;
  batch: number; // TMDB candidates fetched per batch
  refillBelow: number; // fetch another batch when fewer candidates are buffered
  maxBatches: number; // exploration budget per request when fewer than a page is available
  buffer: number; // ranked movies kept for the next pages
  // Gemini (only with the user's own key): the best unscored candidates are checked in one request.
  geminiBatch: number; // candidates sent per request
  geminiWeight: number; // share of the final score that comes from Gemini
  geminiMaxRemove: number; // at most this share of the sent candidates can be removed as "does not fit"
  geminiRejectConfidence: number; // Gemini must be at least this sure before a movie is removed
  geminiBudget: number; // ms allowed for the request
  geminiStartBy: number; // ms after the search started: later than this, Gemini is skipped to protect the time limit
}

export const DEFAULT_RANK: RankConfig = {
  weights: { taste: 0.4, favorite: 0.2, quality: 0.15, dislike: 0.15, discovery: 0.1 },
  signal: { favorite: 5, like: 2, dislike: -4, seed: 3 },
  feature: { g: 1, k: 1, d: 0.8, c: 0.6, y: 0.3, l: 0.3 },
  ramp: { taste: 20, favorite: 3, dislike: 2 },
  quality: { minVotes: 500, mean: 6.5, low: 5, high: 9 },
  dislikeRiskAt: 0.6,
  seedBoost: 20,
  page: 20,
  discoveryShare: 0.2,
  tierStep: 1,
  personalSpan: 0.9,
  discoveryRelevanceGap: 15,
  discoveryPoints: 20,
  similarityPenalty: 0.15,
  diversityGap: 8,
  caps: { genre: 8, theme: 3, franchise: 2, person: 3 },
  themeJaccard: 0.5,
  decadeShare: 0.6,
  batch: 50,
  refillBelow: 40,
  maxBatches: 3,
  buffer: 60,
  geminiBatch: 36,
  geminiWeight: 0.25,
  geminiMaxRemove: 0.3,
  geminiRejectConfidence: 0.6,
  geminiBudget: 4500,
  geminiStartBy: 5000,
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
  parts: { taste: number; favorite: number; quality: number; dislike: number; discovery: number };
  tier: number; // genre-match level, 0 = strong ... 4 = weak
  relevance: number; // 0..100 genre relevance
  qp: number; // how many of the base points came from quality (rating is counted separately in the sort key)
  key: number; // sort key in tenths of a rating point, set by selectPage
  vec: Vec;
}

/** TMDB rating pulled toward the average when there are few votes (rating points, 0..10). */
export function adjustedRating(f: Features, cfg: RankConfig): number {
  if (!f.vc && !f.va) return cfg.quality.mean;
  const { minVotes, mean } = cfg.quality;
  return (f.vc / (f.vc + minVotes)) * f.va + (minVotes / (f.vc + minVotes)) * mean;
}

export function qualityOf(f: Features, cfg: RankConfig): number {
  if (!f.vc && !f.va) return 0.5; // missing data is neutral
  const { low, high } = cfg.quality;
  return clamp01((adjustedRating(f, cfg) - low) / (high - low));
}

/**
 * Scores every movie in the pool from 0 to 100:
 * taste similarity, favorite similarity, quality, dislike avoidance and discovery potential, with the configured weights.
 * Dislikes only lower similarity; they never remove a genre. Components without data are neutral (0.5), and the weight of
 * the personal components grows with the amount of history, the rest going to quality.
 */
export function scorePool<T extends { f: Features }>(
  items: T[],
  signals: Signal[],
  cfg: RankConfig = DEFAULT_RANK,
  ask: GenreAsk = { must: [], any: [] },
  genres: GenreConfig = DEFAULT_GENRES
): Ranked<T>[] {
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
  const cT = clamp01(strength / cfg.ramp.taste);
  const cF = clamp01(favCount / cfg.ramp.favorite);
  const cD = clamp01(dislikes.length / cfg.ramp.dislike);
  const eff = { taste: w.taste * cT, favorite: w.favorite * cF, dislike: w.dislike * cD };
  const quality_w = w.quality + (w.taste - eff.taste) + (w.favorite - eff.favorite) + (w.dislike - eff.dislike); // little history: lean on quality

  return items.map((item, i) => {
    const parts = { taste: tasteN[i], favorite: favN[i], quality: quality[i], dislike: avoid[i], discovery: discovery[i] };
    const base = 100 * (eff.taste * parts.taste + eff.favorite * parts.favorite + quality_w * parts.quality + eff.dislike * parts.dislike + w.discovery * parts.discovery);
    const rel = genreRelevance(item.f.g, ask, genres);
    return { item, f: item.f, base, discovery: discovery[i], parts, tier: rel.tier, relevance: rel.score, qp: quality_w * (parts.quality - 0.5) * 100, key: 0, vec: vecs[i] };
  });
}

/* ---------- Final order and diversity ---------- */
/**
 * The sort key, in tenths of a rating point: the (vote-adjusted) TMDB rating, plus one `tierStep` for every genre-match level above the
 * weakest, plus the personalized score (taste, favorites, dislikes, Gemini...) moving it by at most +-personalSpan/2.
 * So: a better genre match wins when ratings are within a tierStep of each other; a clearly higher rating wins beyond that;
 * and taste only decides between movies that are otherwise level.
 */
export function keyOf<T>(r: Ranked<T>, cfg: RankConfig): number {
  const personal = r.base - r.qp - 50; // the personalized score without its quality part: the rating is already in the key
  return 10 * adjustedRating(r.f, cfg) + (4 - r.tier) * cfg.tierStep * 10 + (personal / 100) * cfg.personalSpan * 10;
}

const decadeOf = (f: Features): number => (f.y ? Math.floor(f.y / 10) : 0);

function jaccard(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const set = new Set(b);
  let inter = 0;
  for (const x of a) if (set.has(x)) inter++;
  return inter / (a.length + b.length - inter);
}

function violates<T>(r: Ranked<T>, picked: Ranked<T>[], cfg: RankConfig, skip: Set<number>): boolean {
  const f = r.f;
  const count = (test: (p: Features) => boolean) => picked.reduce((n, p) => n + (test(p.f) ? 1 : 0), 0);
  // Every genre the user did not ask for counts (the first TMDB genre is not assumed to be the main one).
  for (const g of f.g) if (!skip.has(g) && count((p) => p.g.includes(g)) >= cfg.caps.genre) return true;
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
 * Next movie to take. `remaining` is sorted best first by `key`. Diversity (a similarity penalty and the caps) may only pass over the
 * best movie for one of the same or a BETTER genre tier that is within `diversityGap` key points, so a weaker genre match is never
 * promoted over a stronger one. If every such movie breaks a cap, the best one is taken anyway: the caps relax instead of leaving the page short.
 */
function chooseNext<T>(remaining: Ranked<T>[], picked: Ranked<T>[], cfg: RankConfig, key: (r: Ranked<T>) => number, skip: Set<number>): Ranked<T> {
  const top = remaining[0];
  const floor = key(top) - cfg.diversityGap;
  let best: Ranked<T> | null = null;
  let bestScore = -Infinity;
  for (const r of remaining) {
    if (key(r) < floor) break;
    if (r.tier > top.tier) continue; // never a weaker genre match
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
 * relevant discoveries (same genre level as the strong matches). The page is ordered by the sort key; everything not picked
 * comes back ranked, for the next pages.
 */
export function selectPage<T>(pool: Ranked<T>[], cfg: RankConfig = DEFAULT_RANK, ask: GenreAsk = { must: [], any: [] }): { page: Ranked<T>[]; rest: Ranked<T>[] } {
  const skip = new Set([...ask.must, ...ask.any]);
  for (const r of pool) r.key = keyOf(r, cfg);
  const byKey = [...pool].sort((a, b) => b.key - a.key || a.f.id - b.f.id);
  const n = cfg.page;
  if (byKey.length <= n) return { page: byKey, rest: [] };

  const discoveryN = Math.round(n * cfg.discoveryShare);
  const strongN = n - discoveryN;
  let remaining = byKey;
  const strong: Ranked<T>[] = [];
  while (strong.length < strongN) {
    const r = chooseNext(remaining, strong, cfg, (x) => x.key, skip);
    strong.push(r);
    remaining = remaining.filter((x) => x !== r);
  }

  const keys = strong.map((s) => s.key).sort((a, b) => a - b);
  const tiers = strong.map((s) => s.tier).sort((a, b) => a - b);
  const typicalKey = keys[Math.floor(keys.length / 2)] ?? 0;
  const typicalTier = tiers[Math.floor(tiers.length / 2)] ?? 0;
  const dKey = (x: Ranked<T>) => x.key + cfg.discoveryPoints * x.discovery;
  const disc: Ranked<T>[] = [];
  while (disc.length < discoveryN && remaining.length) {
    const relevant = remaining.filter((x) => x.tier <= typicalTier && x.key >= typicalKey - cfg.discoveryRelevanceGap).sort((a, b) => dKey(b) - dKey(a) || a.f.id - b.f.id);
    const useDisc = relevant.length > 0;
    const r = chooseNext(useDisc ? relevant : remaining, [...strong, ...disc], cfg, useDisc ? dKey : (x) => x.key, skip);
    disc.push(r);
    remaining = remaining.filter((x) => x !== r);
  }

  const page = [...strong, ...disc].sort((a, b) => b.key - a.key || a.f.id - b.f.id);
  return { page, rest: remaining };
}
