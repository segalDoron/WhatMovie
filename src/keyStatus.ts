import { useSyncExternalStore } from "react";

/**
 * Whether the signed-in user has saved their own Gemini key. null = not known (signed out, or not checked yet).
 * The analysis only runs when this is true. Kept in memory only; it is re-checked after every sign-in and page load.
 */
let hasKey: boolean | null = null;
const listeners = new Set<() => void>();

export const keyStatus = {
  get: (): boolean | null => hasKey,
  set(value: boolean | null) {
    if (hasKey === value) return;
    hasKey = value;
    listeners.forEach((l) => l());
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};

export const useHasKey = (): boolean | null => useSyncExternalStore(keyStatus.subscribe, keyStatus.get);
