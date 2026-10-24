import { Eye, EyeOff } from "./Icons";
import type { KeySettings } from "./useKeySettings";

/** The settings screen inside the account modal: the Gemini key field and its messages. The buttons live in the modal footer. */
export default function SettingsPane({ ks }: { ks: KeySettings }) {
  return (
    <form id="key-form" className="sm-body" onSubmit={ks.save}>
      <h3 className="sm-sub">Gemini API key</h3>
      <p className="sm-text">
        Add your key to improve your search results. It is encrypted and never shown again.{" "}
        <a className="sm-link" href="/gemini-key.html" target="_blank" rel="noopener noreferrer">
          show more
        </a>
      </p>

      {ks.loading ? (
        <p className="sm-text" role="status">Loading…</p>
      ) : (
        <>
          <div className="sm-row">
            <span className="sm-label">{ks.hasKey ? `Key saved: •••• ${ks.last4}` : "No key saved"}</span>
            <a className="sm-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Get a key
            </a>
          </div>
          <div className="sm-pass">
            <input
              className="text"
              type={ks.show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={ks.hasKey ? "Replace key" : "Gemini API key"}
              aria-label={ks.hasKey ? "Replace Gemini API key" : "Gemini API key"}
              value={ks.value}
              onChange={(e) => ks.setValue(e.target.value)}
            />
            <button
              type="button"
              className="sm-eye"
              onClick={ks.toggleShow}
              aria-label={ks.show ? "Hide key" : "Show key"}
              aria-pressed={ks.show}
            >
              {ks.show ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </>
      )}

      {/* One status line that always takes up space, so nothing moves when a message appears. */}
      <div className="sm-statusbox">
        <p
          className={ks.error ? "sm-status sm-error" : ks.note ? `sm-status sm-note-${ks.note.tone}` : "sm-status"}
          role="status"
          aria-live="polite"
        >
          {ks.error || ks.note?.text || ""}
        </p>
        {/* Mobile only (the desktop layout keeps this link in the footer). It shares the line with the messages:
            a message replaces it, and after a successful removal the key is gone so the link stays hidden. */}
        {ks.hasKey && !ks.loading && !ks.error && !ks.note && (
          <button type="button" className="am-link sm-remove-mobile" onClick={ks.remove} disabled={ks.busy}>
            Remove key
          </button>
        )}
      </div>
    </form>
  );
}
