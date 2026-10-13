import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Close, Eye, EyeOff } from "./Icons";
import { getKeyStatus, removeKey, saveKey, type KeyStatus } from "./settingsApi";
import { resetAnalysis } from "./analysis";
import "./settings-modal.css";

interface Props {
  onClose: () => void;
}

interface Note {
  text: string;
  tone: "ok" | "plain";
}

const NOTE_MS = 4000;

/** Add, replace or remove the user's own Gemini API key. The key is encrypted on the server and never shown again. */
export default function SettingsModal({ onClose }: Props) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    let live = true;
    getKeyStatus()
      .then((s) => live && setStatus(s))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load your settings."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      setStatus(await action());
      resetAnalysis();
      setValue("");
      setShow(false);
      setNote(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return setError("Paste your Gemini API key.");
    void run(() => saveKey(value.trim()), { text: "Key added", tone: "ok" });
  };

  const hasKey = !!status?.hasKey;

  return createPortal(
    <div className="sm-backdrop">
      <div className="sm" role="dialog" aria-modal="true" aria-labelledby="sm-title">
        <header className="sm-head">
          <h2 id="sm-title">Settings</h2>
          <button className="x" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </header>

        <form className="sm-body" onSubmit={save}>
          <h3 className="sm-sub">Gemini API key</h3>
          <p className="sm-text">
            Add your key to improve your search results. It is encrypted and never shown again.{" "}
            <button type="button" className="sm-link" onClick={() => {}}>
              show more
            </button>
          </p>

          {loading ? (
            <p className="sm-text" role="status">Loading…</p>
          ) : (
            <>
              <div className="sm-row">
                <span className="sm-label">{hasKey ? `Key saved: •••• ${status?.last4}` : "No key saved"}</span>
                <a className="sm-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  Get a key
                </a>
              </div>
              <div className="sm-pass">
                <input
                  className="text"
                  type={show ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={hasKey ? "Replace key" : "Gemini API key"}
                  aria-label={hasKey ? "Replace Gemini API key" : "Gemini API key"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <button
                  type="button"
                  className="sm-eye"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide key" : "Show key"}
                  aria-pressed={show}
                >
                  {show ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </>
          )}

          {/* One status line that always takes up space, so the buttons never move when a message appears. */}
          <p
            className={error ? "sm-status sm-error" : note ? `sm-status sm-note-${note.tone}` : "sm-status"}
            role="status"
            aria-live="polite"
          >
            {error || note?.text || ""}
          </p>

          <div className="sm-footer">
            {hasKey && (
              <button type="button" className="secondary" disabled={busy} onClick={() => void run(removeKey, { text: "Key removed", tone: "ok" })}>
                Remove key
              </button>
            )}
            <button className="primary" type="submit" disabled={busy || loading || !value.trim()}>
              {busy ? "Please wait…" : hasKey ? "Replace key" : "Save key"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}