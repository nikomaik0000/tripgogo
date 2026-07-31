"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { BarChart3, Lock } from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { FilterPanel } from "@/components/filter-panel";
import { SortMenu } from "@/components/sort-menu";
import { ViewToggle } from "@/components/view-toggle";
import { RewardCard } from "@/components/reward-card";
import { RewardTable } from "@/components/reward-table";
import { EmptyState } from "@/components/empty-state";
import { DashboardStatsPanel } from "@/components/dashboard-stats";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useViewMode } from "@/hooks/use-view-mode";
import { useLocalFavorites, useLocalUsedStatus } from "@/hooks/use-local-reward-flags";
import { DEFAULT_FILTERS, type RewardFilters, type RewardWithTags, type SortKey } from "@/lib/types";
import { computeDashboardStats } from "@/lib/stats";
import { toggleFavorite } from "@/app/actions/rewards";
import type { TagRow } from "@/lib/database.types";
import { getExpiryInfo } from "@/lib/utils";

const PAGE_SIZE = 24;

export function RewardExplorer({
  initialRewards,
  allTags,
  isAdmin,
}: {
  initialRewards: RewardWithTags[];
  allTags: TagRow[];
  isAdmin: boolean;
}) {
  const [rewards, setRewards] = useState(initialRewards);
  const [filters, setFilters] = useState<RewardFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>("expiry_asc");
  const [viewMode, setViewMode] = useViewMode("card");
  const [showStats, setShowStats] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Favorites: admins keep the existing Supabase-backed toggle (`rewards.is_favorite`).
  // Everyone else favorites locally in their own browser — never written to Supabase.
  // Used status: a personal checklist for every visitor (including admins), always local.
  const localFavorites = useLocalFavorites();
  const localUsed = useLocalUsedStatus();

  const decoratedRewards = useMemo(
    () =>
      rewards.map((r) => ({
        ...r,
        is_favorite: isAdmin ? r.is_favorite : localFavorites.has(r.id),
        is_used: localUsed.has(r.id),
      })),
    [rewards, isAdmin, localFavorites, localUsed]
  );

  const debouncedQuery = useDebouncedValue(filters.query, 150);

  const filtered = useMemo(() => {
    let list = decoratedRewards;

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      list = list.filter((r) => {
        const tagText = r.tags.map((t) => t.name).join(" ").toLowerCase();
        return (
          r.store_name.toLowerCase().includes(q) ||
          r.content.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          tagText.includes(q)
        );
      });
    }

    if (filters.categories.length) list = list.filter((r) => filters.categories.includes(r.category));
    if (filters.dateCategories.length)
      list = list.filter((r) => filters.dateCategories.includes(r.date_category));
    if (filters.scores.length) list = list.filter((r) => filters.scores.includes(r.score));
    if (filters.favoriteOnly) list = list.filter((r) => r.is_favorite);
    if (filters.usedFilter === "used") list = list.filter((r) => r.is_used);
    if (filters.usedFilter === "unused") list = list.filter((r) => !r.is_used);
    if (filters.tagIds.length)
      list = list.filter((r) => r.tags.some((t) => filters.tagIds.includes(t.id)));
    if (filters.hideExpired)
      list = list.filter((r) => getExpiryInfo(r.expiry_date).state !== "expired");

    return list;
  }, [decoratedRewards, debouncedQuery, filters]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sort) {
      case "expiry_asc":
        return list.sort((a, b) => {
          if (!a.expiry_date && !b.expiry_date) return 0;
          if (!a.expiry_date) return 1;
          if (!b.expiry_date) return -1;
          return a.expiry_date.localeCompare(b.expiry_date);
        });
      case "score_desc":
        return list.sort((a, b) => b.score - a.score);
      default:
        return list;
    }
  }, [filtered, sort]);

  useEffect(() => setVisibleCount(PAGE_SIZE), [debouncedQuery, filters, sort]);

  const visible = sorted.slice(0, visibleCount);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, sorted.length));
        }
      },
      { rootMargin: "600px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sorted.length]);

  const handleToggleFavorite = useCallback(
    (id: string, next: boolean) => {
      if (isAdmin) {
        setRewards((prev) => prev.map((r) => (r.id === id ? { ...r, is_favorite: next } : r)));
        toggleFavorite(id, next).catch(() => {
          setRewards((prev) => prev.map((r) => (r.id === id ? { ...r, is_favorite: !next } : r)));
        });
      } else {
        localFavorites.toggle(id, next);
      }
    },
    [isAdmin, localFavorites]
  );

  const handleToggleUsed = useCallback(
    (id: string, next: boolean) => {
      localUsed.toggle(id, next);
    },
    [localUsed]
  );

  const activeFilterCount =
    filters.categories.length +
    filters.dateCategories.length +
    filters.scores.length +
    filters.tagIds.length +
    (filters.favoriteOnly ? 1 : 0) +
    (filters.usedFilter !== "all" ? 1 : 0) +
    (filters.hideExpired ? 1 : 0);

  const stats = useMemo(() => computeDashboardStats(decoratedRewards), [decoratedRewards]);

  // Tag filter options should only include tags actually used somewhere in the
  // dataset, but stay stable while the person applies other filters — so this
  // is derived from the full `rewards` list, not `filtered`/`sorted`.
  const usedTagIds = useMemo(
    () => new Set(rewards.flatMap((r) => r.tags.map((t) => t.id))),
    [rewards]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-8 border-b border-border bg-bg/90 px-4 pb-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          {/* Phase 4C v2: Chinese subtitle removed per feedback — a simpler,
              English-wordmark-only header for a calmer, more editorial feel.
              Phase 4D: smaller size + tighter tracking below `sm` so the
              full wordmark always fits on one line on narrow screens —
              whitespace-nowrap (not truncate) so it's never cut off with
              an ellipsis either. */}
          <h1 className="logo-title min-w-0 flex-1 whitespace-nowrap text-base font-normal uppercase tracking-wordmarkCompact text-ink sm:text-3xl sm:tracking-wordmark">
            Birthday Rewards
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowStats((v) => !v)} aria-label="切換儀表板">
              <BarChart3 className="h-4 w-4" />
            </Button>
            {/* v2: front-end "新增優惠" removed — this just links to the
                gated /admin area for whoever knows to look for it. */}
            <Link
              href="/admin"
              aria-label="後台管理"
              title="後台管理"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface hover:text-ink"
            >
              <Lock className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
        <SearchBar value={filters.query} onChange={(query) => setFilters((f) => ({ ...f, query }))} />
        {/* Phase 4C: filter toggle and result count now share one row/border
            instead of two separate rows. */}
        <div className="mt-4">
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            allTags={allTags}
            usedTagIds={usedTagIds}
            activeCount={activeFilterCount}
            resultCount={sorted.length}
          />
        </div>
        {/* Phase 4E: mt-4 (was mt-3) so this row's breathing space matches
            the Search Bar → Filter gap above it. */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <SortMenu value={sort} onChange={setSort} />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </header>

      {showStats && (
        <div className="mb-5 animate-slideUp">
          <DashboardStatsPanel stats={stats} />
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState />
      ) : viewMode === "table" ? (
        <RewardTable
          rewards={visible}
          onToggleFavorite={handleToggleFavorite}
          onToggleUsed={handleToggleUsed}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <RewardCard
              key={r.id}
              reward={r}
              onToggleFavorite={handleToggleFavorite}
              onToggleUsed={handleToggleUsed}
            />
          ))}
        </div>
      )}

      {visibleCount < sorted.length && <div ref={sentinelRef} className="h-10" />}
    </div>
  );
}
