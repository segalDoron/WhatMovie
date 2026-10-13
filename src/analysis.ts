import { authFetch, ApiError } from "./authFetch";

/** Data sent for analysis. What goes in here is decided when the analysis feature is planned. */
export type AnalysisPayload = Record<string, unknown>;

let lastSent = "";
let lastResult = "";
let inFlight: { sent: string; promise: Promise<string> } | null = null;

/** True when the user must add or fix their Gemini key (open the Settings modal). */
export const needsKey = (e: unknown): boolean =>
  e instanceof ApiError && ["no_key", "key_unreadable", "key_rejected"].includes(e.code);

/**
 * Background analysis: sends the data to /api/analyze with the user's token.
 * It does not count as activity for the 30-minute rule, and the same data is never sent twice in a row.
 * Not connected to any screen yet.
 */
export function runAnalysis(payload: AnalysisPayload): Promise<string> {
  const sent = JSON.stringify(payload);
  if (sent === lastSent && lastResult) return Promise.resolve(lastResult);
  if (inFlight?.sent === sent) return inFlight.promise;

  const promise = authFetch<{ analysis: string }>(
    "/api/analyze",
    { method: "POST", body: JSON.stringify({ payload }) },
    { touch: false }
  )
    .then((r) => {
      lastSent = sent;
      lastResult = r.analysis;
      return r.analysis;
    })
    .finally(() => {
      if (inFlight?.sent === sent) inFlight = null;
    });
  inFlight = { sent, promise };
  return promise;
}

/** Forget the last result (used when the user signs out or changes their key). */
export function resetAnalysis(): void {
  lastSent = "";
  lastResult = "";
}
