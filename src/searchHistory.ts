import type { Answers } from "./types";
import { users } from "./users";

export interface SavedSearch {
  id: string;
  savedAt: number;
  answers: Answers;
}

export const MAX_SEARCHES = 5;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const isSaved = (v: unknown): v is SavedSearch => {
  const s = v as SavedSearch;
  return !!s && typeof s.id === "string" && !!s.answers && typeof s.answers === "object";
};

const clean = (a: Answers): Answers =>
  Object.fromEntries(Object.entries(a).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "")));
const signature = (a: Answers) =>
  JSON.stringify(Object.keys(a).sort().map((k) => [k, Array.isArray(a[k]) ? [...(a[k] as string[])].sort() : a[k]]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const searchHistory = {
  getAll: (): SavedSearch[] => {
    const active = users.getActive();
    return active ? active.searchHistory.filter(isSaved) : [];
  },

  add(answers: Answers) {
    const active = users.getActive();
    if (!active) return;

    const cleaned = clean(answers);
    const sig = signature(cleaned);
    const rest = active.searchHistory.filter((s) => signature(s.answers) !== sig);
    const updated = [{ id: uid(), savedAt: Date.now(), answers: cleaned }, ...rest].slice(0, MAX_SEARCHES);
    users.updateUser(active.id, { ...active, searchHistory: updated });
  },

  remove(id: string) {
    const active = users.getActive();
    if (!active) return;
    users.updateUser(active.id, { ...active, searchHistory: active.searchHistory.filter((s) => s.id !== id) });
  },

  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    if (listeners.size === 1) {
      const sub = users.subscribe(() => emit());
      return () => {
        listeners.delete(cb);
        if (!listeners.size) sub();
      };
    }
    return () => listeners.delete(cb);
  },
};
