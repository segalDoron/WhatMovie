import type { Favorite } from "./favorites";
import type { SavedSearch } from "./searchHistory";
import type { VoteStore } from "./votes";

/** A local profile with data scoped to that user. */
export interface UserInfo {
  id: number;
  name: string;
  isActive: boolean;
  favorites: Favorite[];
  searchHistory: SavedSearch[];
  votes: VoteStore;
}

const KEY = "usersInfo";
const GUEST_ID = 9999; // reserved for the guest user
const listeners = new Set<() => void>();
let snapshot: UserInfo[] | null = null; // stable reference between changes (needed by useSyncExternalStore)

const isVoteStore = (v: unknown): v is VoteStore => {
  const o = v as VoteStore;
  return !!o && Array.isArray(o.like) && Array.isArray(o.dislike);
};

const isUser = (v: unknown): v is UserInfo => {
  const u = v as UserInfo;
  return (
    !!u &&
    typeof u.id === "number" &&
    typeof u.name === "string" &&
    u.name.trim() !== "" &&
    typeof u.isActive === "boolean" &&
    Array.isArray(u.favorites) &&
    Array.isArray(u.searchHistory) &&
    isVoteStore(u.votes)
  );
};

function read(): UserInfo[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isUser) : [];
  } catch {
    return [];
  }
}

const emit = () => listeners.forEach((l) => l());

function commit(list: UserInfo[]) {
  snapshot = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the profiles still work in memory for this session.
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

function newId(taken: Set<number>): number {
  for (let i = 0; i < 50; i++) {
    const id = 1000 + Math.floor(Math.random() * 9000);
    if (!taken.has(id)) return id;
  }
  for (let id = 1000; id <= 9999; id++) if (!taken.has(id)) return id; // nearly full: take the first free one
  throw new Error("No free user ID left");
}

export const users = {
  getAll: (): UserInfo[] => (snapshot ??= read()),
  getActive: (): UserInfo | undefined => users.getAll().find((u) => u.isActive),

  /** App start: ensure guest user exists and is active. Guest data is cleared on every page load. */
  ensureGuest() {
    let list = users.getAll();
    let guest = list.find((u) => u.id === GUEST_ID);

    if (guest) {
      // Guest exists: clear their data but keep the user entry
      guest = { ...guest, favorites: [], searchHistory: [], votes: { like: [], dislike: [] }, isActive: true };
      commit(list.map((u) => ({ ...u, isActive: u.id === GUEST_ID, ...( u.id === GUEST_ID ? guest : {}) })));
    } else {
      // No guest: create one and make sure they're the only active user
      guest = {
        id: GUEST_ID,
        name: "Guest",
        isActive: true,
        favorites: [],
        searchHistory: [],
        votes: { like: [], dislike: [] },
      };
      commit([...list.map((u) => ({ ...u, isActive: false })), guest]);
    }
  },

  /** App start: users exist but none is active -> the first one becomes active. (Extra active users are cleared.) */
  ensureActive() {
    const list = users.getAll();
    if (!list.length) return;
    const firstActive = list.findIndex((u) => u.isActive);
    const keep = firstActive === -1 ? 0 : firstActive;
    if (list.every((u, i) => u.isActive === (i === keep))) return; // already exactly one active user
    commit(list.map((u, i) => ({ ...u, isActive: i === keep })));
  },

  /** All users become inactive, the new one is added as the active user. */
  add(name: string): UserInfo {
    const list = users.getAll();
    const user: UserInfo = {
      id: newId(new Set(list.map((u) => u.id))),
      name: name.trim(),
      isActive: true,
      favorites: [],
      searchHistory: [],
      votes: { like: [], dislike: [] },
    };
    commit([...list.map((u) => ({ ...u, isActive: false })), user]);
    return user;
  },

  /** Only this user is active afterwards. */
  setActive(id: number) {
    if (!users.getAll().some((u) => u.id === id)) return;
    commit(users.getAll().map((u) => ({ ...u, isActive: u.id === id })));
  },

  /** Removes a user. If the active user is removed, the first remaining user becomes active. */
  remove(id: number) {
    const list = users.getAll();
    if (!list.some((u) => u.id === id)) return;
    const rest = list.filter((u) => u.id !== id);
    const hasActive = rest.some((u) => u.isActive);
    commit(!rest.length || hasActive ? rest : rest.map((u, i) => (i === 0 ? { ...u, isActive: true } : u)));
  },

  /** Updates a specific user's data. */
  updateUser(id: number, updates: Partial<UserInfo>) {
    const list = users.getAll();
    const idx = list.findIndex((u) => u.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...updates, id, isActive: list[idx].isActive }; // preserve id and isActive
    commit([...list]);
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
