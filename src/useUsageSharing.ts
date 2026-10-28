import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { dbCall, SessionExpiredError } from "./session";
import { supabase } from "./supabase";

/** What applies before the user chooses: the same default as the server (METRICS_DEFAULT, "on" unless set to "off"). */
export const SHARE_DEFAULT = true;

/**
 * The user's choice to share anonymous usage data (what was recommended and how it ranked).
 * Turning it off also deletes what was already collected (the database function rec_forget_me).
 * `available` is false when the preference table is not set up yet: the switch is then hidden.
 */
export function useUsageSharing() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [enabled, setEnabled] = useState<boolean | null>(null); // null while loading
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    let live = true;
    dbCall<{ share_usage: boolean } | null>(() => supabase.from("user_preferences").select("share_usage").maybeSingle())
      .then((row) => live && setEnabled(row ? row.share_usage : SHARE_DEFAULT))
      .catch((e) => {
        if (live && !(e instanceof SessionExpiredError)) setAvailable(false);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const toggle = async (next: boolean) => {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      await dbCall(() =>
        supabase.from("user_preferences").upsert({ user_id: userId, share_usage: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      );
      if (!next) await dbCall(() => supabase.rpc("rec_forget_me")); // switching off also deletes what was collected
      setEnabled(next);
    } catch (e) {
      if (!(e instanceof SessionExpiredError)) setError("Couldn't save this choice. Try again.");
    }
    setBusy(false);
  };

  return { enabled, available, busy, error, toggle };
}
