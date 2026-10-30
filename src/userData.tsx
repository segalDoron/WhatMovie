import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Answers, Movie } from "./types";
import { useAuth } from "./AuthProvider";
import { clearCache, dbCall, SessionExpiredError } from "./session";
import { supabase } from "./supabase";

export type Favorite = Pick<Movie, "id" | "title" | "genres" | "year" | "score" | "poster" | "rating">;
export type Vote = "like" | "dislike";
export interface VoteStore { like: Favorite[]; dislike: Favorite[] }
export interface SavedSearch { id: string; savedAt: number; answers: Answers }

interface Data { favorites: Favorite[]; votes: VoteStore; searches: SavedSearch[]; watched: Favorite[] }
interface Legacy { favorites: Favorite[]; like: Favorite[]; dislike: Favorite[]; searches: SavedSearch[] }
interface MovieDbRow { movie_id: number; title: string; genres: string[]; year: string | null; score: number | string | null; poster: string | null; rating: string | null }

interface UserDataValue extends Data {
  isFavorite: (id: number) => boolean;
  isWatched: (id: number) => boolean;
  isDisliked: (id: number) => boolean;
  toggleWatched: (m: Favorite) => void;
  toggleFavorite: (m: Favorite) => void;
  removeFavorite: (id: number) => void;
  vote: (kind: Vote, m: Favorite) => void;
  addSearch: (answers: Answers) => void;
  removeSearch: (id: string) => void;
  syncError: string;
  dismissSyncError: () => void;
}

const EMPTY: Data = { favorites: [], votes: { like: [], dislike: [] }, searches: [], watched: [] };
const MAX_SEARCHES = 10;
const LOCAL_PREFIX = "local-"; // searches not yet saved to the database
const CACHE = { favorites: "mt:favorites", votes: "mt:votes", searches: "mt:searches", watched: "mt:watched" };
const LEGACY_KEYS = ["usersInfo", "movie-tonight:favorites", "movie-tonight:searches", "vote"];
const SYNC_ERROR = "Couldn't save to your account. Changes stay on this page until you refresh.";

const pick = (m: Favorite): Favorite => ({ id: m.id, title: m.title, genres: m.genres, year: m.year, score: m.score, poster: m.poster, rating: m.rating });
const movieRow = (m: Favorite) => ({ movie_id: m.id, title: m.title, genres: m.genres, year: m.year, score: m.score, poster: m.poster, rating: m.rating });
const isLocal = (id: string) => id.startsWith(LOCAL_PREFIX);

function uniqueBy<T>(xs: T[], key: (x: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return xs.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const cleanAnswers = (a: Answers): Answers =>
  Object.fromEntries(Object.entries(a).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "")));

const signature = (a: Answers) =>
  JSON.stringify(Object.keys(a).sort().map((k) => [k, Array.isArray(a[k]) ? [...(a[k] as string[])].sort() : a[k]]));

const dedupeSearches = (list: SavedSearch[]): SavedSearch[] =>
  uniqueBy(list, (s) => signature(s.answers)).slice(0, MAX_SEARCHES);

const fromRow = (r: MovieDbRow): Favorite => ({
  id: r.movie_id,
  title: r.title,
  genres: r.genres ?? [],
  year: r.year ?? "",
  score: Number(r.score ?? 0),
  poster: r.poster,
  rating: r.rating ?? "",
});

/** The UI cache. Written on every change, cleared on every page load. */
function writeCache(d: Data) {
  try {
    localStorage.setItem(CACHE.favorites, JSON.stringify(d.favorites));
    localStorage.setItem(CACHE.votes, JSON.stringify(d.votes));
    localStorage.setItem(CACHE.searches, JSON.stringify(d.searches));
    localStorage.setItem(CACHE.watched, JSON.stringify(d.watched));
  } catch {
    /* storage full or blocked: the page still works for this visit */
  }
}

/** Reads the profiles from before Supabase. Guest data is skipped. */
function readLegacy(): Legacy | null {
  const raw = localStorage.getItem("usersInfo");
  if (!raw) return null;
  try {
    const users = JSON.parse(raw) as Array<{
      id: number;
      favorites?: Favorite[];
      votes?: Partial<VoteStore>;
      searchHistory?: { answers: Answers }[];
    }>;
    const real = users.filter((u) => u.id !== 9999);
    return {
      favorites: real.flatMap((u) => u.favorites ?? []),
      like: real.flatMap((u) => u.votes?.like ?? []),
      dislike: real.flatMap((u) => u.votes?.dislike ?? []),
      searches: real.flatMap((u) => (u.searchHistory ?? []).map((s) => ({ id: "", savedAt: 0, answers: s.answers }))),
    };
  } catch {
    return null;
  }
}

/** Everything the page has, plus what came from the legacy profiles, merged so each movie appears once. */
function mergePlan(page: Data, legacy: Legacy | null): Data {
  const l: Legacy = legacy ?? { favorites: [], like: [], dislike: [], searches: [] };
  const like = uniqueBy([...page.votes.like, ...l.like], (m) => m.id);
  const likeIds = new Set(like.map((m) => m.id));
  return {
    favorites: uniqueBy([...page.favorites, ...l.favorites], (f) => f.id),
    votes: {
      like,
      dislike: uniqueBy([...page.votes.dislike, ...l.dislike], (m) => m.id).filter((m) => !likeIds.has(m.id)),
    },
    searches: dedupeSearches([...page.searches, ...l.searches]),
    watched: uniqueBy(page.watched, (m) => m.id),
  };
}

async function uploadAll(uid: string, plan: Data): Promise<void> {
  if (plan.favorites.length) {
    await dbCall(() =>
      supabase.from("favorites").upsert(plan.favorites.map((f) => ({ user_id: uid, ...movieRow(f) })), { onConflict: "user_id,movie_id" })
    );
  }
  if (plan.watched.length) {
    // Not fatal: until the watched table exists in the database, everything else still syncs.
    await dbCall(() =>
      supabase.from("watched").upsert(plan.watched.map((m) => ({ user_id: uid, ...movieRow(m) })), { onConflict: "user_id,movie_id" })
    ).catch((e) => {
      if (e instanceof SessionExpiredError) throw e;
    });
  }
  const votes = [
    ...plan.votes.like.map((m) => ({ user_id: uid, kind: "like", ...movieRow(m) })),
    ...plan.votes.dislike.map((m) => ({ user_id: uid, kind: "dislike", ...movieRow(m) })),
  ];
  if (votes.length) await dbCall(() => supabase.from("votes").upsert(votes, { onConflict: "user_id,movie_id" }));
  if (plan.searches.length) {
    // created_at is set per row (newest first) so the 5-search trim keeps the right ones.
    await dbCall(() =>
      supabase.from("search_history").insert(
        plan.searches.map((s, i) => ({ user_id: uid, answers: s.answers, created_at: new Date(Date.now() - i * 1000).toISOString() }))
      )
    );
  }
}

async function loadAll(): Promise<Data> {
  const favs = await dbCall<MovieDbRow[]>(() =>
    supabase.from("favorites").select("movie_id,title,genres,year,score,poster,rating").order("created_at", { ascending: false })
  );
  const watched = await dbCall<MovieDbRow[]>(() =>
    supabase.from("watched").select("movie_id,title,genres,year,score,poster,rating").order("created_at", { ascending: false })
  ).catch((e) => {
    if (e instanceof SessionExpiredError) throw e;
    return [] as MovieDbRow[]; // the watched table is missing or unreadable: carry on without it
  });
  const votes = await dbCall<(MovieDbRow & { kind: Vote })[]>(() =>
    supabase.from("votes").select("kind,movie_id,title,genres,year,score,poster,rating").order("created_at", { ascending: false })
  );
  const searches = await dbCall<{ id: string; answers: Answers; created_at: string }[]>(() =>
    supabase.from("search_history").select("id,answers,created_at").order("created_at", { ascending: false }).limit(MAX_SEARCHES)
  );
  return {
    favorites: favs.map(fromRow),
    votes: {
      like: votes.filter((v) => v.kind === "like").map(fromRow),
      dislike: votes.filter((v) => v.kind === "dislike").map(fromRow),
    },
    searches: dedupeSearches(searches.map((s) => ({ id: s.id, savedAt: Date.parse(s.created_at), answers: s.answers }))),
    watched: watched.map(fromRow),
  };
}

const UserDataContext = createContext<UserDataValue | null>(null);

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Every page load starts empty: the cache is cleared, and signed-in data is loaded from the database below.
  const [data, setData] = useState<Data>(() => {
    clearCache();
    return EMPTY;
  });
  const [syncError, setSyncError] = useState("");
  const dataRef = useRef(data);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const commit = (next: Data) => {
    dataRef.current = next;
    setData(next);
    writeCache(next);
  };

  const fail = (e: unknown) => {
    if (e instanceof SessionExpiredError) return; // AuthProvider ends the session and shows the login modal
    setSyncError(SYNC_ERROR);
  };

  const remote = (run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    dbCall(run).catch(fail);
  };

  // Sign-in: save what the page has (and any legacy data), then load the account. Sign-out: clear the page.
  useEffect(() => {
    if (!userId) {
      dataRef.current = EMPTY;
      setData(EMPTY);
      return;
    }
    let live = true;
    const legacy = readLegacy();
    const plan = mergePlan(dataRef.current, legacy);
    (async () => {
      try {
        await uploadAll(userId, plan);
        const fresh = await loadAll();
        if (!live) return;
        commit(fresh);
        LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
      } catch (e) {
        if (live) fail(e);
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isFavorite = (id: number) => data.favorites.some((f) => f.id === id);

  const isWatched = (id: number) => data.watched.some((m) => m.id === id);
  const isDisliked = (id: number) => data.votes.dislike.some((m) => m.id === id);

  // "Watched" movies are not recommended again.
  const toggleWatched = (m: Favorite) => {
    const cur = dataRef.current;
    const has = cur.watched.some((x) => x.id === m.id);
    commit({ ...cur, watched: has ? cur.watched.filter((x) => x.id !== m.id) : [pick(m), ...cur.watched] });
    const uid = userIdRef.current;
    if (!uid) return;
    if (has) remote(() => supabase.from("watched").delete().eq("movie_id", m.id));
    else remote(() => supabase.from("watched").upsert({ user_id: uid, ...movieRow(m) }, { onConflict: "user_id,movie_id" }));
  };

  const toggleFavorite = (m: Favorite) => {
    const cur = dataRef.current;
    const has = cur.favorites.some((f) => f.id === m.id);
    commit({ ...cur, favorites: has ? cur.favorites.filter((f) => f.id !== m.id) : [pick(m), ...cur.favorites] });
    const uid = userIdRef.current;
    if (!uid) return;
    if (has) remote(() => supabase.from("favorites").delete().eq("movie_id", m.id));
    else remote(() => supabase.from("favorites").upsert({ user_id: uid, ...movieRow(m) }, { onConflict: "user_id,movie_id" }));
  };

  const removeFavorite = (id: number) => {
    const cur = dataRef.current;
    commit({ ...cur, favorites: cur.favorites.filter((f) => f.id !== id) });
    if (userIdRef.current) remote(() => supabase.from("favorites").delete().eq("movie_id", id));
  };

  const vote = (kind: Vote, m: Favorite) => {
    const cur = dataRef.current;
    const other: Vote = kind === "like" ? "dislike" : "like";
    const has = cur.votes[kind].some((x) => x.id === m.id);
    const votes: VoteStore = has
      ? { ...cur.votes, [kind]: cur.votes[kind].filter((x) => x.id !== m.id) }
      : { ...cur.votes, [kind]: [pick(m), ...cur.votes[kind]], [other]: cur.votes[other].filter((x) => x.id !== m.id) };
    commit({ ...cur, votes });
    const uid = userIdRef.current;
    if (!uid) return;
    if (has) remote(() => supabase.from("votes").delete().eq("movie_id", m.id));
    else remote(() => supabase.from("votes").upsert({ user_id: uid, kind, ...movieRow(m) }, { onConflict: "user_id,movie_id" }));
  };

  const addSearch = (answers: Answers) => {
    const cur = dataRef.current;
    const cleaned = cleanAnswers(answers);
    const sig = signature(cleaned);
    const dupIds = cur.searches.filter((s) => signature(s.answers) === sig).map((s) => s.id).filter((id) => !isLocal(id));
    const temp: SavedSearch = { id: LOCAL_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), savedAt: Date.now(), answers: cleaned };
    commit({ ...cur, searches: dedupeSearches([temp, ...cur.searches]) });

    const uid = userIdRef.current;
    if (!uid) return;
    void (async () => {
      try {
        if (dupIds.length) await dbCall(() => supabase.from("search_history").delete().in("id", dupIds));
        const row = await dbCall<{ id: string }>(() =>
          supabase.from("search_history").insert({ user_id: uid, answers: cleaned }).select("id").single()
        );
        const next = { ...dataRef.current, searches: dataRef.current.searches.map((s) => (s.id === temp.id ? { ...s, id: row.id } : s)) };
        dataRef.current = next;
        setData(next);
        writeCache(next);
      } catch (e) {
        fail(e);
      }
    })();
  };

  const removeSearch = (id: string) => {
    const cur = dataRef.current;
    commit({ ...cur, searches: cur.searches.filter((s) => s.id !== id) });
    if (userIdRef.current && !isLocal(id)) remote(() => supabase.from("search_history").delete().eq("id", id));
  };

  const value: UserDataValue = {
    ...data,
    isFavorite,
    isWatched,
    isDisliked,
    toggleWatched,
    toggleFavorite,
    removeFavorite,
    vote,
    addSearch,
    removeSearch,
    syncError,
    dismissSyncError: () => setSyncError(""),
  };

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataValue {
  const value = useContext(UserDataContext);
  if (!value) throw new Error("useUserData must be used inside UserDataProvider");
  return value;
}
