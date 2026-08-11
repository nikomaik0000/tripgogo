"use client";

import { CirclePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AddIconButton({ label, onClick, context = "content", className }: {
  label: string;
  onClick: () => void;
  context?: "header" | "content";
  className?: string;
}) {
  return <Button type="button" size="icon" variant="ghost" aria-label={label} title={label} onClick={onClick} className={cn("shrink-0 rounded-full text-muted hover:bg-surface hover:text-ink", context === "header" ? "h-11 w-11" : "h-10 w-10", className)}><CirclePlus className="h-5 w-5" /></Button>;
}
