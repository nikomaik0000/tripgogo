"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type AuthValue = {
  user: User | null;
  ready: boolean;
  signInWithGoogle: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const AUTH_RETURN_PATH_KEY = "travel-gogo:auth-return-path";

function safeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      setUser(data.user);
      setReady(true);
      if (data.user) {
        const returnPath = window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY);
        if (returnPath) {
          window.sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
          const safePath = safeReturnPath(returnPath);
          if (safePath !== window.location.pathname + window.location.search) window.location.replace(safePath);
        }
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    ready,
    async signInWithGoogle(next = window.location.pathname) {
      window.sessionStorage.setItem(AUTH_RETURN_PATH_KEY, safeReturnPath(next));
      const callback = new URL("/auth/callback", window.location.origin);
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
    },
  }), [ready, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
