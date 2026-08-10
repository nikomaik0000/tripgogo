"use client";

import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export function AuthControl() {
  const { user, ready, signInWithGoogle, signOut } = useAuth();
  const label = user ? "登出" : "使用 Google 登入";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!ready}
      onClick={() => {
        const action = user ? signOut() : signInWithGoogle();
        action.catch((error: unknown) => toast.error(error instanceof Error ? error.message : "登入操作失敗"));
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink disabled:opacity-0 sm:h-9 sm:w-9"
    >
      {user ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
    </button>
  );
}
