import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { beginSession, clearCache, endSession, isIdle, EXPIRED_EVENT } from "./session";

interface AuthValue {
  loading: boolean; // true until we know whether a valid session exists
  session: Session | null;
  user: User | null;
  expired: boolean; // the last session ended because of the 30-minute rule
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const IDLE_CHECK_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  // Sign-in state. Restores a stored session on load, but ends it if the idle window passed while the app was closed.
  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(EXPIRED_EVENT, onExpired);

    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session && isIdle()) void endSession();
      else setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        clearCache();
        setSession(null);
        setLoading(false);
        return;
      }
      if (event === "SIGNED_IN" && s) {
        // Deferred: Supabase must not be called from inside this callback. The session is only
        // exposed once the server has started the 30-minute window, so no query runs before that.
        setTimeout(async () => {
          try {
            await beginSession();
            setExpired(false);
            setSession(s);
          } catch {
            await endSession("signout");
          }
          setLoading(false);
        }, 0);
        return;
      }
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") setSession(s);
      // INITIAL_SESSION is ignored: the getSession() call above handles the restore.
    });

    return () => {
      alive = false;
      window.removeEventListener(EXPIRED_EVENT, onExpired);
      sub.subscription.unsubscribe();
    };
  }, []);

  // While signed in, end the session as soon as the idle window passes, even if the app stays open and untouched.
  useEffect(() => {
    if (!session) return;
    const check = () => {
      if (isIdle()) void endSession();
    };
    const timer = window.setInterval(check, IDLE_CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [session]);

  const signOut = async () => {
    setExpired(false);
    await endSession("signout");
  };

  return (
    <AuthContext.Provider value={{ loading, session, user: session?.user ?? null, expired, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
