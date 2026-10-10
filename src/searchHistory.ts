import type { Answers } from "./types";
import { users } from "./users";

export interface SavedSearch {
  id: string;
  savedAt: number;
  answers: Answers;
}

export const MAX_SEARCHES = 5;
const NONE: SavedSearch[] = []; // one shared empty list, so getAll() returns the same value while nothing changed

const clean = (a: Answers): Answers =>
  Object.fromEntries(Object.entries(a).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "")));
const signature = (a: Answers) =>
  JSON.stringify(Object.keys(a).sort().map((k) => [k, Array.isArray(a[k]) ? [...(a[k] as string[])].sort() : a[k]]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const searchHistory = {
  getAll: (): SavedSearch[] => users.getActive()?.searchHistory ?? NONE,

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

  subscribe: (cb: () => void): (() => void) => users.subscribe(cb),
};
