"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { PlatformRole } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

type AuthValue = {
  user: User | null;
  platformRole: PlatformRole;
  isAdmin: boolean;
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
  const [authReady, setAuthReady] = useState(false);
  const [platformAccess, setPlatformAccess] = useState<{ userId: string | null; role: PlatformRole }>({ userId: null, role: "user" });

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser()
      .then(({ data }: { data: { user: User | null } }) => {
        setUser(data.user);
        if (data.user) {
          const returnPath = window.sessionStorage.getItem(AUTH_RETURN_PATH_KEY);
          if (returnPath) {
            window.sessionStorage.removeItem(AUTH_RETURN_PATH_KEY);
            const safePath = safeReturnPath(returnPath);
            if (safePath !== window.location.pathname + window.location.search) window.location.replace(safePath);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setAuthReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setPlatformAccess({ userId: null, role: "user" });
      return;
    }
    let cancelled = false;
    void createClient().from("tg_profiles").select("platform_role").eq("id", user.id).maybeSingle()
      .then(({ data, error }: { data: { platform_role: PlatformRole } | null; error: unknown }) => {
        if (cancelled) return;
        setPlatformAccess({ userId: user.id, role: !error && data?.platform_role === "admin" ? "admin" : "user" });
      })
      .catch(() => {
        if (!cancelled) setPlatformAccess({ userId: user.id, role: "user" });
      });
    return () => { cancelled = true; };
  }, [authReady, user]);

  const platformRole = user && platformAccess.userId === user.id ? platformAccess.role : "user";
  const ready = authReady && (user ? platformAccess.userId === user.id : platformAccess.userId === null);
  const value = useMemo<AuthValue>(() => ({
    user,
    platformRole,
    isAdmin: platformRole === "admin",
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
  }), [platformRole, ready, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
