import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider";
import { Close } from "./Icons";
import SettingsPane from "./SettingsPane";
import { useKeySettings } from "./useKeySettings";
import { useUsageSharing } from "./useUsageSharing";
import "./account-modal.css";

type View = "account" | "settings";

interface Props {
  onClose: () => void;
  initialView?: View; // "settings" opens straight on the key screen (used right after signing in without a key)
}

const TITLES: Record<View, string> = { account: "Who am I?", settings: "Settings" };
const TITLE_FADE_MS = 130;

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
// `inert` removes a hidden screen from the tab order and from screen readers.
const inertProps = (on: boolean): Record<string, string> => (on ? { inert: "" } : {});

/** "Who am I?": the signed-in account and Log out, with the settings (Gemini key) as a second screen inside the same modal. */
export default function AccountModal({ onClose, initialView = "account" }: Props) {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<View>(initialView);
  const [loggingOut, setLoggingOut] = useState(false);
  const ks = useKeySettings(view === "settings");
  const usage = useUsageSharing();

  // The header text fades out, changes, and fades back in.
  const [title, setTitle] = useState(TITLES[initialView]);
  const [titleHidden, setTitleHidden] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTitleHidden(true);
    const t = window.setTimeout(() => {
      setTitle(TITLES[view]);
      setTitleHidden(false);
    }, TITLE_FADE_MS);
    return () => window.clearTimeout(t);
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const logout = async () => {
    setLoggingOut(true);
    await signOut();
    onClose();
  };

  const inSettings = view === "settings";
  const saveLabel = ks.busy ? "Please wait…" : ks.hasKey ? "Replace key" : "Save key";

  return createPortal(
    <div className="am-backdrop">
      <div className="am" role="dialog" aria-modal="true" aria-labelledby="am-title">
        <header className="am-head">
          <h2 id="am-title" className={`am-title ${titleHidden ? "hidden" : ""}`}>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </header>

        <div className="am-views" data-view={view}>
          <div className="am-pane am-pane-account" aria-hidden={inSettings} {...inertProps(inSettings)}>
            <dl className="am-body">
              <div className="am-row">
                <dt>Email</dt>
                <dd>{user?.email ?? "—"}</dd>
              </div>
              <div className="am-row">
                <dt>Member since</dt>
                <dd>{formatDate(user?.created_at)}</dd>
              </div>
              <div className="am-row">
                <dt>Last sign-in</dt>
                <dd>{formatDate(user?.last_sign_in_at)}</dd>
              </div>
            </dl>
            <p className="am-note">You are signed out automatically after 30 minutes without activity.</p>
            {usage.available && (
              <div className="am-share">
                <div className="am-share-text">
                  <strong>Help improve recommendations</strong>
                  <p>Share anonymous usage data: what was recommended and how it ranked. No name or email. Turning it off also deletes what was collected.</p>
                  {usage.error && <p className="am-share-error" role="alert">{usage.error}</p>}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={usage.enabled === true}
                  aria-label="Share anonymous usage data"
                  className="am-switch"
                  disabled={usage.busy || usage.enabled === null}
                  onClick={() => void usage.toggle(!usage.enabled)}
                >
                  <span />
                </button>
              </div>
            )}
          </div>

          <div className="am-pane am-pane-settings" aria-hidden={!inSettings} {...inertProps(!inSettings)}>
            <SettingsPane ks={ks} />
          </div>
        </div>

        <div className="am-footer">
          <button
            className="secondary"
            onClick={() => setView(inSettings ? "account" : "settings")}
            disabled={loggingOut || ks.busy}
          >
            {inSettings ? "Back" : "Settings"}
          </button>
          <div className="am-actions">
            {inSettings && ks.hasKey && (
              <button type="button" className="am-link" onClick={ks.remove} disabled={ks.busy}>
                Remove key
              </button>
            )}
            {inSettings ? (
              <button className="primary" type="submit" form="key-form" disabled={ks.busy || ks.loading || !ks.value.trim()}>
                {saveLabel}
              </button>
            ) : (
              <button className="primary" type="button" onClick={logout} disabled={loggingOut}>
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
