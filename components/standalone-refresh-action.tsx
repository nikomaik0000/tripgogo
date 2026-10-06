"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type StandaloneNavigator = Navigator & { standalone?: boolean };

export function StandaloneRefreshAction({ className = "" }: { className?: string }) {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as StandaloneNavigator).standalone));
  }, []);

  if (!standalone) return null;
  return <button type="button" aria-label="重新整理" title="重新整理" onClick={() => window.location.reload()} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-searchBackground hover:text-ink sm:h-9 sm:w-9 ${className}`}><RefreshCw className="h-4 w-4 stroke-[1.5]" /></button>;
}
