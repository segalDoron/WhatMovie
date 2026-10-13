import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { Close, Eye, EyeOff } from "./Icons";
import "./login-modal.css";

type Mode = "magic" | "password" | "signup";

interface Props {
  expired: boolean; // show the "session expired" notice
  onDismiss?: () => void; // when given, the modal can be closed (X button, Escape). Omit it to require sign-in.
}

/**
 * Email delivery switch. While email is not set up (no custom SMTP, "Confirm email" off in Supabase), keep this false:
 * the "Email link" tab is hidden, Password is the default, and sign-up signs the user in at once.
 * When email works, set it to true and turn "Confirm email" back on in Supabase.
 */
const EMAIL_ENABLED = false;

const TITLES: Record<Mode, string> = { magic: "Sign in with email", password: "Sign in", signup: "Create account" };

/** Rules for a strong password on sign-up. Stricter than the Supabase policy, so anything accepted here is accepted there. */
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "An uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { label: "A lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { label: "A number (0–9)", test: (p) => /\d/.test(p) },
  { label: "A symbol (for example ! @ # $ %)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];
const isStrongPassword = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

export default function LoginModal({ expired, onDismiss }: Props) {
  const [mode, setMode] = useState<Mode>(EMAIL_ENABLED ? "magic" : "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    const address = email.trim();
    if (!address) return setError("Enter your email.");
    if (mode !== "magic" && !password) return setError("Enter your password.");
    if (mode === "signup" && !isStrongPassword(password)) return setError("This is not a strong password. Meet every rule below.");

    setBusy(true);
    const redirect = { emailRedirectTo: window.location.origin };
    let message: string | null = null;

    if (mode === "magic") {
      const r = await supabase.auth.signInWithOtp({ email: address, options: { ...redirect, shouldCreateUser: true } });
      message = r.error?.message ?? null;
      if (!message) setInfo("Check your email for the sign-in link.");
    } else if (mode === "password") {
      const r = await supabase.auth.signInWithPassword({ email: address, password });
      message = r.error?.message ?? null;
    } else {
      const r = await supabase.auth.signUp({ email: address, password, options: redirect });
      message = r.error?.message ?? null;
      if (!message && EMAIL_ENABLED) setInfo("Check your email to confirm your account, then sign in.");
    }

    setBusy(false);
    if (message) setError(message);
  };

  const submitLabel = busy ? "Please wait…" : mode === "magic" ? "Send link" : mode === "password" ? "Sign in" : "Create account";

  return createPortal(
    <div className="lm-backdrop">
      <div className="lm" role="dialog" aria-modal="true" aria-labelledby="lm-title">
        <header className="lm-head">
          <h2 id="lm-title">{TITLES[mode]}</h2>
          {onDismiss && (
            <button className="x" onClick={onDismiss} aria-label="Close">
              <Close />
            </button>
          )}
        </header>

        {EMAIL_ENABLED && mode !== "signup" && (
          <div className="lm-tabs" role="tablist">
            <button role="tab" className="lm-tab" aria-selected={mode === "magic"} onClick={() => switchMode("magic")}>
              Email link
            </button>
            <button role="tab" className="lm-tab" aria-selected={mode === "password"} onClick={() => switchMode("password")}>
              Password
            </button>
          </div>
        )}

        {expired && <p className="lm-notice">Your session ended after 30 minutes without activity. Sign in again.</p>}

        <form className="lm-body" onSubmit={submit}>
          <input
            className="text"
            type="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode !== "magic" && (
            <div className="lm-pass">
              <input
                className="text"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="Password"
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="lm-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          )}
          {mode === "signup" && (
            <ul className="lm-rules" aria-label="Password rules">
              {PASSWORD_RULES.map((r) => (
                <li key={r.label} data-ok={r.test(password)}>
                  {r.label}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="lm-error" role="alert">{error}</p>}
          {info && <p className="lm-info" role="status">{info}</p>}

          <div className="lm-footer">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => switchMode(mode === "signup" ? "password" : "signup")}
            >
              {mode === "signup" ? "Have an account? Sign in" : "Create account"}
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}