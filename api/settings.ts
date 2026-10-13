// Saves, reports and removes the user's own Gemini API key. The key is encrypted here and never sent back to the browser.
import { admin, authenticate, encryptKey, fail, json, GEMINI } from "./_shared.js";

// Only a sanity check (printable characters, no spaces, sane length). Google decides whether the key is real,
// so a new key format never gets blocked here.
const KEY_SHAPE = /^[\x21-\x7E]{20,300}$/;

interface KeyStatus { hasKey: boolean; last4: string | null; updatedAt: string | null }

async function readStatus(userId: string): Promise<KeyStatus> {
  const { data, error } = await admin()
    .from("user_settings")
    .select("key_last4,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { hasKey: !!data, last4: data?.key_last4 ?? null, updatedAt: data?.updated_at ?? null };
}

/** Asks Google to list one model. Costs nothing and tells us whether the key works. */
async function checkWithGoogle(apiKey: string): Promise<"ok" | "rejected" | "unreachable"> {
  try {
    const res = await fetch(`${GEMINI}/models?pageSize=1`, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(8000) });
    if (res.ok) return "ok";
    return [400, 401, 403].includes(res.status) ? "rejected" : "unreachable";
  } catch {
    return "unreachable";
  }
}

const serverError = (e: unknown): Response => {
  console.error("settings:", e instanceof Error ? e.message : "unknown error"); // never log request bodies
  return fail(500, "server_error", "Something went wrong.");
};

export async function GET(request: Request) {
  try {
    const auth = await authenticate(request, { touch: true });
    if (auth instanceof Response) return auth;
    return json(await readStatus(auth.user.id));
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticate(request, { touch: true });
    if (auth instanceof Response) return auth;

    const body = (await request.json().catch(() => null)) as { apiKey?: unknown } | null;
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    if (!KEY_SHAPE.test(apiKey)) return fail(400, "invalid_key", "That doesn't look like a Gemini API key.");

    const check = await checkWithGoogle(apiKey);
    if (check === "rejected") return fail(400, "key_rejected", "Google rejected this key. Check it and try again.");
    if (check === "unreachable") return fail(502, "validation_failed", "Couldn't reach Google to check the key. Try again.");

    const { error } = await admin().from("user_settings").upsert(
      {
        user_id: auth.user.id,
        gemini_key_enc: encryptKey(apiKey, auth.user.id),
        key_last4: apiKey.slice(-4),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) throw new Error(error.message);
    return json(await readStatus(auth.user.id));
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticate(request, { touch: true });
    if (auth instanceof Response) return auth;
    const { error } = await admin().from("user_settings").delete().eq("user_id", auth.user.id);
    if (error) throw new Error(error.message);
    return json({ hasKey: false, last4: null, updatedAt: null } satisfies KeyStatus);
  } catch (e) {
    return serverError(e);
  }
}