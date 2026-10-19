import { useEffect, useState, type FormEvent } from "react";
import { getKeyStatus, removeKey, saveKey, type KeyStatus } from "./settingsApi";
import { resetAnalysis } from "./analysis";
import { keyStatus } from "./keyStatus";

export interface Note {
  text: string;
  tone: "ok";
}

const NOTE_MS = 4000;

/**
 * State and actions for the Gemini API key. The settings screen and the buttons in the modal footer share it.
 * The key's status is only requested once `active` turns true (the first time the settings are shown).
 */
export function useKeySettings(active: boolean) {
  const [started, setStarted] = useState(active);
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(active);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    if (active) setStarted(true);
  }, [active]);

  useEffect(() => {
    if (!started) return;
    let live = true;
    setLoading(true);
    getKeyStatus()
      .then((s) => {
        if (!live) return;
        setStatus(s);
        keyStatus.set(s.hasKey);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load your settings."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [started]);

  // A note disappears after a few seconds. A new note object restarts the timer, even with the same text.
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_MS);
    return () => window.clearTimeout(t);
  }, [note]);

  const run = async (action: () => Promise<KeyStatus>, done: Note) => {
    setBusy(true);
    setError("");
    setNote(null);
    try {
      const next = await action();
      setStatus(next);
      keyStatus.set(next.hasKey);
      resetAnalysis();
      setValue("");
      setShow(false);
      setNote(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (!value.trim()) return setError("Paste your Gemini API key.");
    void run(() => saveKey(value.trim()), { text: "Key added", tone: "ok" });
  };

  const remove = () => void run(removeKey, { text: "Key removed", tone: "ok" });

  return {
    loading,
    value,
    setValue,
    show,
    toggleShow: () => setShow((v) => !v),
    busy,
    error,
    note,
    hasKey: !!status?.hasKey,
    last4: status?.last4 ?? null,
    save,
    remove,
  };
}

export type KeySettings = ReturnType<typeof useKeySettings>;
