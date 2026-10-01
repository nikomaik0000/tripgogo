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
  return <nav className="trip-primary-nav grid grid-cols-4 sm:flex sm:w-max" aria-label="旅程分頁">
    {TABS.map(({ value, label, icon: Icon }) => {
      const isActive = activeTab === value;
      const className = `trip-primary-nav-item relative flex min-w-0 flex-col items-center justify-center py-1 text-[10px] font-normal transition-colors after:absolute after:bottom-0 after:left-1/2 after:h-px after:w-0 after:-translate-x-1/2 after:bg-ink after:transition-all sm:h-9 sm:flex-row sm:px-[18px] sm:py-0 sm:text-[11px] sm:after:hidden ${isActive ? "text-ink after:w-6" : "text-muted hover:text-[#555555]"}`;
      const content = <span className={`relative flex flex-col items-center gap-1 sm:flex-row sm:gap-1.5 sm:after:absolute sm:after:-bottom-2 sm:after:left-0 sm:after:h-px sm:after:bg-ink sm:after:transition-all ${isActive ? "sm:after:w-full" : "sm:after:w-0"}`}><span className="flex h-6 w-6 items-center justify-center sm:h-auto sm:w-auto"><Icon className="h-4 w-4 shrink-0 stroke-[1.5]" /></span><span className="trip-primary-nav-label whitespace-nowrap">{label}</span></span>;
      return onTabChange
        ? <button key={value} type="button" aria-label={label} onClick={() => onTabChange(value)} className={className}>{content}</button>
        : <Link key={value} href={`/trip/${tripId}?tab=${value}`} aria-label={label} className={className}>{content}</Link>;
    })}
  </nav>;
}
