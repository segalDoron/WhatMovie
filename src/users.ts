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

export const isGuest = (u: Pick<UserInfo, "id">): boolean => u.id === GUEST_ID;

/** First letter of the first name, capitalised: "eli cohen" -> "E". */
export function initialOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return ([...first][0] ?? "").toUpperCase();
}
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

  /**
   * App start.
   * - The guest always exists and starts empty: guest data is cleared on every load.
   * - If there is a user other than the guest, one of them is active: the one that was already active,
   *   otherwise the first one. With no other user, the guest is active.
   */
  startUp() {
    const list = users.getAll();
    const real = list.filter((u) => !isGuest(u));
    const activeId = (real.find((u) => u.isActive) ?? real[0])?.id ?? GUEST_ID;

    const old = list.find(isGuest);
    const guest: UserInfo = {
      id: GUEST_ID,
      name: old?.name ?? "Guest",
      isActive: activeId === GUEST_ID,
      favorites: [],
      searchHistory: [],
      votes: { like: [], dislike: [] },
    };
    const others = list.filter((u) => !isGuest(u)).map((u) => ({ ...u, isActive: u.id === activeId }));
    // Keep the order the users already had; a brand new guest goes first.
    const next = old ? list.map((u) => (isGuest(u) ? guest : { ...u, isActive: u.id === activeId })) : [guest, ...others];
    commit(next);
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
    if (!rest.length || rest.some((u) => u.isActive)) return commit(rest);
    const next = (rest.find((u) => !isGuest(u)) ?? rest[0]).id; // a real user first, the guest only if nobody else is left
    commit(rest.map((u) => ({ ...u, isActive: u.id === next })));
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
