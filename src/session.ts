import { supabase } from "./supabase";

/** Idle time after which the session ends: 30 minutes since the last database call. */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
/** Fired on window when the session ends because of inactivity. */
export const EXPIRED_EVENT = "mt:session-expired";

const LAST_CALL_KEY = "auth:lastDbCallAt";
const CACHE_PREFIX = "mt:";

export class SessionExpiredError extends Error {
  constructor() {
    super("Your session expired. Sign in again.");
  }
}

export const lastDbCallAt = (): number => Number(localStorage.getItem(LAST_CALL_KEY)) || 0;
export const isIdle = (now = Date.now()): boolean => now - lastDbCallAt() > IDLE_LIMIT_MS;
const markCall = () => localStorage.setItem(LAST_CALL_KEY, String(Date.now()));
/** Records a successful server call that counts as activity (used by the API helpers). */
export const markDbCall = markCall;

/** Removes every app-owned key. The theme key and Supabase's own session key do not start with "mt:", so they stay. */
export function clearCache(): void {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
  }
}

/** Called once right after a fresh sign-in: starts the 30-minute window on the server and in the browser. */
export async function beginSession(): Promise<void> {
  const { error } = await supabase.rpc("start_session");
  if (error) throw new Error(error.message);
  markCall();
}

/** Ends the session everywhere: local cache and Supabase session. An expiry also tells the UI why. */
export async function endSession(reason: "expired" | "signout" = "expired"): Promise<void> {
  clearCache();
  await supabase.auth.signOut();
  if (reason === "expired") window.dispatchEvent(new Event(EXPIRED_EVENT));
}

type Result<T> = { data: T | null; error: { message: string } | null };

/**
 * Wraps every database call. Checks the browser's idle window, refreshes the server-side window
 * with touch_session, then runs the query. An expired session ends the session and throws SessionExpiredError.
 */
export async function dbCall<T>(run: () => PromiseLike<Result<T>>): Promise<T> {
  if (isIdle()) {
    await endSession();
    throw new SessionExpiredError();
  }
  const touch = await supabase.rpc("touch_session");
  if (touch.error) {
    if (touch.error.message.includes("session_expired")) {
      await endSession();
      throw new SessionExpiredError();
    }
    throw new Error(touch.error.message);
  }
  markCall();
  const res = await run();
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
