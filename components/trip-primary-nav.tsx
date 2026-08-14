"use client";

import Link from "next/link";
import { CalendarDays, MapPin, NotebookTabs, UtensilsCrossed } from "lucide-react";

export type TripPrimaryTab = "daily" | "place" | "food" | "outline";

const TABS = [
  { value: "daily" as const, label: "每日", icon: CalendarDays },
  { value: "place" as const, label: "地點", icon: MapPin },
  { value: "food" as const, label: "美食", icon: UtensilsCrossed },
  { value: "outline" as const, label: "大綱", icon: NotebookTabs },
];

export function TripPrimaryNav({ activeTab, onTabChange, tripId }: {
  activeTab?: TripPrimaryTab;
  onTabChange?: (tab: TripPrimaryTab) => void;
  tripId?: string;
}) {
  return <nav className="grid grid-cols-4 gap-1 rounded-card bg-searchBackground p-1" aria-label="旅程分頁">
    {TABS.map(({ value, label, icon: Icon }) => {
      const className = `flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg text-sm transition-colors ${activeTab === value ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink"}`;
      const content = <><Icon className="h-5 w-5 shrink-0" /><span className="truncate">{label}</span></>;
      return onTabChange
        ? <button key={value} type="button" onClick={() => onTabChange(value)} className={className}>{content}</button>
        : <Link key={value} href={`/trip/${tripId}?tab=${value}`} className={className}>{content}</Link>;
    })}
  </nav>;
}
