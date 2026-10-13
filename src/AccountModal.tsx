import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider";
import { Close } from "./Icons";
import "./account-modal.css";

interface Props {
  onClose: () => void;
  onSettings: () => void; // opens the settings (API key) modal on top of this one
  settingsOpen: boolean; // while it is open, Escape belongs to the settings modal
}

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

/** "Who am I?": shows the signed-in account and a log out button. */
export default function AccountModal({ onClose, onSettings, settingsOpen }: Props) {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settingsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, settingsOpen]);

  const logout = async () => {
    setBusy(true);
    await signOut();
    onClose();
  };

  return createPortal(
    <div className="am-backdrop">
      <div className="am" role="dialog" aria-modal="true" aria-labelledby="am-title">
        <header className="am-head">
          <h2 id="am-title">Who am I?</h2>
          <button className="x" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </header>

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

        <div className="am-footer">
          <button className="secondary" onClick={onSettings} disabled={busy}>
            Settings
          </button>
          <button className="primary" onClick={logout} disabled={busy}>
            {busy ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
