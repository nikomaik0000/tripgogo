"use client";

import { Heart, Check, Link2 } from "lucide-react";
import { RewardCardBody } from "@/components/reward-card-body";
import type { RewardWithTags } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RewardCard({
  reward,
  onToggleFavorite,
  onToggleUsed,
}: {
  reward: RewardWithTags;
  onToggleFavorite: (id: string, next: boolean) => void;
  // v2: 已使用 is now admin-only. When this is omitted (general visitor),
  // the card shows a plain read-only status instead of a clickable toggle.
  onToggleUsed?: (id: string, next: boolean) => void;
}) {
  // A labeled pill (not icon-only) — the text makes the status legible at a
  // glance. All colors come from theme tokens (accent-green / border / muted).
  const usedPillClasses = cn(
    "flex shrink-0 items-center gap-1 rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
    reward.is_used
      ? "border-accent-green bg-accent-green/15 text-accent-green"
      : "border-border text-muted"
  );

  return (
    <div
      className={cn(
        // Phase 4B: the card is no longer a click target — no dialog, no
        // detail-page navigation.
        // Phase 4C: fixed min-height (instead of a reserved blank notes
        // line) keeps every card the same height, whether or not a reward
        // has notes — the bottom section is pinned down with mt-auto.
        // Phase 4D: padding/min-height trimmed to remove empty vertical
        // space on shorter cards — typography is unchanged, only the
        // surrounding whitespace is tighter.
        "group relative flex min-h-card flex-col rounded-card border border-border bg-surface p-5 shadow-soft transition-shadow hover:shadow-pop",
        reward.is_used && "opacity-60"
      )}
    >
      {/* Phase 4C: Link / Favorite / Used live together in the top-right
          corner. Used stays a labeled pill (easier to read at a glance)
          while Link/Favorite stay icon-only, all aligned on one row. */}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-storeName font-normal">{reward.store_name}</span>

        <div className="flex shrink-0 items-center gap-1.5">
          {reward.official_url && (
            <a
              href={reward.official_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`前往 ${reward.store_name} 官網`}
              className="shrink-0 rounded-full p-1.5 text-muted hover:bg-bg"
            >
              <Link2 className="h-4 w-4" />
            </a>
          )}

          <button
            type="button"
            onClick={() => onToggleFavorite(reward.id, !reward.is_favorite)}
            aria-label={reward.is_favorite ? "取消收藏" : "加入收藏"}
            aria-pressed={reward.is_favorite}
            className="shrink-0 rounded-full p-1.5 text-muted hover:bg-bg"
          >
            <Heart className={cn("h-4 w-4", reward.is_favorite && "fill-accent-coffee text-accent-coffee")} />
          </button>

          {onToggleUsed ? (
            <button
              type="button"
              onClick={() => onToggleUsed(reward.id, !reward.is_used)}
              aria-pressed={reward.is_used}
              className={usedPillClasses}
            >
              <Check className="h-3 w-3" />
              {reward.is_used ? "已兌換" : "未使用"}
            </button>
          ) : (
            // Read-only status for general visitors (v2: no public write access)
            <span className={usedPillClasses}>
              <Check className="h-3 w-3" />
              {reward.is_used ? "已兌換" : "未使用"}
            </span>
          )}
        </div>
      </div>

      {/* Thin divider under the title — the dedicated `divider` token (same
          value as the badge border). */}
      <div className="mt-4 border-t border-divider" />

      <div className="mt-4 flex flex-1 flex-col">
        <RewardCardBody reward={reward} pinBadgesToBottom />
      </div>
    </div>
  );
}
