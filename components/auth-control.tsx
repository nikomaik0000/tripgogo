"use client";

import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function AuthControl({ className }: { className?: string } = {}) {
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
      className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-searchBackground hover:text-[#555555] disabled:opacity-0 [&>svg]:stroke-[1.5]", className)}
    >
      {user ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
    </button>
  );
}
