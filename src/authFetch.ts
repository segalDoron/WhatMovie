import { supabase } from "./supabase";
import { endSession, isIdle, markDbCall, SessionExpiredError } from "./session";

/** An error answered by our own /api routes. `code` is the machine-readable reason (no_key, key_rejected, ...). */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Calls one of our /api routes with the signed-in user's access token.
 * touch: true  = a user action that counts as activity for the 30-minute rule.
 * touch: false = background work that must not extend the session.
 */
export async function authFetch<T>(path: string, init: RequestInit, opts: { touch: boolean }): Promise<T> {
  if (isIdle()) {
    await endSession();
    throw new SessionExpiredError();
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("not_signed_in", "Sign in required.", 401);

  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.error === "session_expired") {
      await endSession();
      throw new SessionExpiredError();
    }
    throw new ApiError(body.error ?? "error", body.message ?? "Request failed.", res.status);
  }
  if (opts.touch) markDbCall();
  return body as T;
}
