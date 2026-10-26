// Shared helpers for the serverless routes. The leading underscore keeps Vercel from exposing this file as a route.
import { createClient, type User } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const fail = (status: number, error: string, message: string): Response => json({ error, message }, status);

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client. Bypasses RLS, so every query made with it must filter by the verified user id. */
export const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), clientOptions);

/**
 * Checks the caller's Supabase JWT and the 30-minute session rule.
 * touch: true  = a user action. It refreshes the activity window (touch_session).
 * touch: false = background work. It only checks the window (session_fresh), so it never keeps an idle session alive.
 * Returns the verified user, or a ready-made error Response.
 */
export async function authenticate(request: Request, opts: { touch: boolean }): Promise<{ user: User } | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return fail(401, "not_signed_in", "Sign in required.");

  const asUser = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await asUser.auth.getUser(token);
  if (error || !data.user) return fail(401, "not_signed_in", "Sign in required.");

  const expired = () => fail(401, "session_expired", "Your session ended after 30 minutes without activity.");
  if (opts.touch) {
    const t = await asUser.rpc("touch_session");
    if (t.error) return t.error.message.includes("session_expired") ? expired() : fail(500, "server_error", "Something went wrong.");
  } else {
    const f = await asUser.rpc("session_fresh");
    if (f.error) return fail(500, "server_error", "Something went wrong.");
    if (f.data !== true) return expired();
  }
  return { user: data.user };
}

/* ---------- Encryption of the user's API key: AES-256-GCM, bound to the user id ---------- */
const masterKey = () => createHash("sha256").update(env("SETTINGS_ENCRYPTION_KEY")).digest();

export function encryptKey(plain: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(userId)); // a stored value can't be moved to another user's row
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptKey(stored: string, userId: string): string {
  if (!stored.startsWith("v1:")) throw new Error("Unknown key format");
  const raw = Buffer.from(stored.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/**
 * The signed-in user's own Gemini key, or null. Never throws and never rejects a request:
 * no token, an expired session, no saved key or any error all mean "use the server's key instead".
 */
export async function userGeminiKey(request: Request): Promise<string | null> {
  return (await userContext(request)).geminiKey;
}

/** Who is asking (when signed in with a fresh session) and their own Gemini key (when saved). Never throws and never rejects a request. */
export async function userContext(request: Request): Promise<{ userId: string | null; geminiKey: string | null }> {
  try {
    if (!request.headers.get("authorization")) return { userId: null, geminiKey: null };
    const auth = await authenticate(request, { touch: false });
    if (auth instanceof Response) return { userId: null, geminiKey: null };
    let geminiKey: string | null = null;
    try {
      const { data } = await admin().from("user_settings").select("gemini_key_enc").eq("user_id", auth.user.id).maybeSingle();
      geminiKey = data ? decryptKey(data.gemini_key_enc, auth.user.id) : null;
    } catch {
      geminiKey = null;
    }
    return { userId: auth.user.id, geminiKey };
  } catch {
    return { userId: null, geminiKey: null };
  }
}