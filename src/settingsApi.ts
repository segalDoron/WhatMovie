import { authFetch } from "./authFetch";

export interface KeyStatus {
  hasKey: boolean;
  last4: string | null;
  updatedAt: string | null;
}

// The server never returns the key itself, only whether one is saved and its last 4 characters.
export const getKeyStatus = () => authFetch<KeyStatus>("/api/settings", { method: "GET" }, { touch: true });
export const saveKey = (apiKey: string) =>
  authFetch<KeyStatus>("/api/settings", { method: "POST", body: JSON.stringify({ apiKey }) }, { touch: true });
export const removeKey = () => authFetch<KeyStatus>("/api/settings", { method: "DELETE" }, { touch: true });
