import type { Answers } from "./types";

/** One saved search: the exact answers that were submitted. */
export interface SavedSearch { id: string; savedAt: number; answers: Answers }

const KEY = "movie-tonight:searches";
export const MAX_SEARCHES = 5;
const listeners = new Set<() => void>();
let snapshot: SavedSearch[] | null = null; // stable reference between changes (needed by useSyncExternalStore)

const isSaved = (v: unknown): v is SavedSearch => {
  const s = v as SavedSearch;
  return !!s && typeof s.id === "string" && !!s.answers && typeof s.answers === "object";
};

function read(): SavedSearch[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isSaved).slice(0, MAX_SEARCHES) : [];
  } catch {
    return [];
  }
}

const emit = () => listeners.forEach((l) => l());

function commit(list: SavedSearch[]) {
  snapshot = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the list still works in memory for this session.
  }
  emit();
}

// Keeps several tabs in sync. Only attached while something is subscribed.
const onStorage = (e: StorageEvent) => {
  if (e.key === KEY || e.key === null) {
    snapshot = null;
    emit();
  }
};

// Unanswered questions are dropped, and the same choices in any order count as the same search.
const clean = (a: Answers): Answers =>
  Object.fromEntries(Object.entries(a).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "")));
const signature = (a: Answers) =>
  JSON.stringify(Object.keys(a).sort().map((k) => [k, Array.isArray(a[k]) ? [...(a[k] as string[])].sort() : a[k]]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const searchHistory = {
  getAll: (): SavedSearch[] => (snapshot ??= read()),
  /** Newest first. Keeps the last 5: adding a sixth pushes out the oldest. A repeated search just moves to the top. */
  add(answers: Answers) {
    const cleaned = clean(answers);
    const sig = signature(cleaned);
    const rest = searchHistory.getAll().filter((s) => signature(s.answers) !== sig);
    commit([{ id: uid(), savedAt: Date.now(), answers: cleaned }, ...rest].slice(0, MAX_SEARCHES));
  },
  remove(id: string) {
    commit(searchHistory.getAll().filter((s) => s.id !== id));
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    if (listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      if (!listeners.size) window.removeEventListener("storage", onStorage);
    };
  },
};
