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

/** Accepts profiles saved before per-user data existed (they get empty lists) and drops anything malformed. */
function toUser(v: unknown): UserInfo | null {
  const u = v as Partial<UserInfo> | null;
  if (!u || typeof u.id !== "number" || typeof u.name !== "string" || u.name.trim() === "" || typeof u.isActive !== "boolean") return null;
  return {
    id: u.id,
    name: u.name,
    isActive: u.isActive,
    favorites: Array.isArray(u.favorites) ? u.favorites : [],
    searchHistory: Array.isArray(u.searchHistory) ? u.searchHistory : [],
    votes: isVoteStore(u.votes) ? u.votes : { like: [], dislike: [] },
  };
}

function read(): UserInfo[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(toUser).filter((u): u is UserInfo => u !== null) : [];
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
    const list = users.getAll();
    const guestIdx = list.findIndex((u) => u.id === GUEST_ID);

    if (guestIdx >= 0) {
      // Guest exists: clear data, make active, deactivate others
      const updated = list.map((u, i) =>
        i === guestIdx
          ? { ...u, favorites: [], searchHistory: [], votes: { like: [], dislike: [] }, isActive: true }
          : { ...u, isActive: false }
      );
      commit(updated);
    } else {
      // No guest: create one as the active user
      const guest: UserInfo = {
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

  /** Updates a specific user's data (id and isActive can't be changed here). */
  updateUser(id: number, updates: Partial<UserInfo>) {
    const list = users.getAll();
    if (!list.some((u) => u.id === id)) return;
    commit(list.map((u) => (u.id === id ? { ...u, ...updates, id: u.id, isActive: u.isActive } : u)));
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
