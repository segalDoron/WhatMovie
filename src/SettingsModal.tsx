import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Close, Eye, EyeOff } from "./Icons";
import { getKeyStatus, removeKey, saveKey, type KeyStatus } from "./settingsApi";
import { resetAnalysis } from "./analysis";
import "./settings-modal.css";

interface Props {
  onClose: () => void;
}

/** Add, replace or remove the user's own Gemini API key. The key is encrypted on the server and never shown again. */
export default function SettingsModal({ onClose }: Props) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

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

  const run = async (action: () => Promise<KeyStatus>, done: string) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      setStatus(await action());
      resetAnalysis();
      setValue("");
      setShow(false);
      setInfo(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return setError("Paste your Gemini API key.");
    void run(() => saveKey(value.trim()), "Key saved.");
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
            Add your own Google Gemini key to use AI analysis. It is encrypted before it is stored and is never shown again.{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a key</a>
          </p>

          {loading ? (
            <p className="sm-text" role="status">Loading…</p>
          ) : (
            <>
              {hasKey && <p className="sm-saved">Key saved: •••• {status?.last4}</p>}
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

          {error && <p className="sm-error" role="alert">{error}</p>}
          {info && <p className="sm-info" role="status">{info}</p>}

          <div className="sm-footer">
            {hasKey && (
              <button type="button" className="secondary" disabled={busy} onClick={() => void run(removeKey, "Key removed.")}>
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
