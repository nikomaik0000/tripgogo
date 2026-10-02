"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpDown, CalendarDays, CarFront, ChevronRight, Clock3, FolderHeart, Hotel, Link2, MapPin, MapPinned, Navigation, Plane, Search, SquarePen, Trash2, UtensilsCrossed, X } from "lucide-react";
import { closestCenter, DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { AuthControl } from "@/components/auth-control";
import { AddIconButton } from "@/components/add-icon-button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ClampedNote } from "@/components/clamped-note";
import { FlightDialog } from "@/components/flight-dialog";
import { HotelStayDialog } from "@/components/hotel-stay-dialog";
import { isDailyCardInteractiveTarget, MobileDailySwipeActions, MobileSwipeActions, useMobileSwipeGroup } from "@/components/mobile-daily-swipe-actions";
import { TransportationDialog } from "@/components/transportation-dialog";
import { TravelItemDialog } from "@/components/travel-item-dialog";
import { TripPrimaryNav, type TripPrimaryTab } from "@/components/trip-primary-nav";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayDate, tripDates } from "@/lib/travel-dates";
import { getBusinessStatus, type BusinessStatus } from "@/lib/business-hours";
import { useAuth } from "@/lib/auth-context";
import { travelRepository } from "@/lib/travel-repository";
import type { Flight, HotelStay, Transportation, TravelItem, TravelItemSort, TravelItemType, Trip, TripRole } from "@/lib/types";

type Tab = TripPrimaryTab;
const CARD_NOTE_TYPOGRAPHY = "text-xs font-normal leading-[1.65] tracking-body text-muted";

export function TripWorkspace({ tripId, initialTrip, initialItems, initialFlights, initialHotelStays, initialTransportations }: {
  tripId: string;
  initialTrip?: Trip;
  initialItems: TravelItem[];
  initialFlights: Flight[];
  initialHotelStays: HotelStay[];
  initialTransportations: Transportation[];
}) {
  const { user, isAdmin, ready: authReady } = useAuth();
  const [trip, setTrip] = useState<Trip | undefined>(initialTrip);
  const [items, setItems] = useState<TravelItem[]>(initialItems);
  const [role, setRole] = useState<TripRole>();
  const [tab, setTab] = useState<Tab>("daily");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TravelItemSort>("date");
  const [dialog, setDialog] = useState<{ open: boolean; type: TravelItemType; item?: TravelItem; initialDate?: string; allowTypeChange?: boolean; desktopTwoColumn?: boolean }>({ open: false, type: "place" });
  const [deleting, setDeleting] = useState<TravelItem>();
  const refresh = useCallback(async () => {
    try {
      const [nextTrip, nextItems] = await Promise.all([travelRepository.getTrip(tripId), travelRepository.getItems(tripId)]);
      setTrip(nextTrip);
      setItems(nextItems);
    } catch (error) {
      toast.error(errorMessage(error, "無法載入旅行"));
    }
  }, [tripId]);
  useEffect(() => {
    if (!authReady || !user) {
      setRole(undefined);
      return;
    }
    travelRepository.getTripRole(tripId).then(setRole).catch((error) => toast.error(errorMessage(error, "無法確認編輯權限")));
  }, [authReady, tripId, user]);
  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab === "daily" || requestedTab === "place" || requestedTab === "food" || requestedTab === "outline") setTab(requestedTab);
  }, []);
  const edit = (item: TravelItem) => setDialog({ open: true, type: item.type, item });
  const editListItem = (item: TravelItem) => setDialog({ open: true, type: item.type, item, desktopTwoColumn: true });
  const remove = (item: TravelItem) => setDeleting(item);
  const canEdit = isAdmin || Boolean(role);

  const reorder = async (activeId: string, overId: string) => {
    const active = items.find((item) => item.id === activeId);
    const over = items.find((item) => item.id === overId);
    if (!active?.date || !over || active.tripId !== over.tripId || active.date !== over.date) return;
    const group = items.filter((item) => item.date === active.date).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const from = group.findIndex((item) => item.id === activeId);
    const to = group.findIndex((item) => item.id === overId);
    const [moved] = group.splice(from, 1);
    group.splice(to, 0, moved);
    const orders = new Map(group.map((item, order) => [item.id, order]));
    setItems((current) => current.map((item) => orders.has(item.id) ? { ...item, order: orders.get(item.id)! } : item));
    try {
      await travelRepository.reorderItems(tripId, active.date, group.map((item) => item.id));
    } catch (error) {
      toast.error(errorMessage(error, "排序儲存失敗"));
      await refresh();
    }
  };

  if (!trip) return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Link href="/" className="flex items-center gap-2 text-sm text-muted"><ArrowLeft className="h-4 w-4" />返回</Link><EmptyState title="找不到這趟旅行" description="" /></main>;
  return (
    <main className="trip-page-shell mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-border bg-bg/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-initial"><Link href="/" aria-label="返回" title="返回" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-searchBackground hover:text-[#555555] sm:h-9 sm:w-9"><ArrowLeft className="h-4 w-4 stroke-[1.5]" /></Link><h1 className="min-w-0 truncate text-title font-semibold">{trip.name}</h1></div>
        <div aria-hidden="true" className="hidden min-w-4 flex-1 sm:block" />
        <div className="hidden shrink-0 items-center gap-3 sm:flex"><TripPrimaryNav activeTab={tab} onTabChange={setTab} /><div className="flex shrink-0 items-center justify-end gap-1 before:mr-2 before:h-[30px] before:w-px before:shrink-0 before:bg-border before:content-['']"><Link href={`/trip/${tripId}/resources`} aria-label="旅途資訊" title="旅途資訊" className="flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent text-muted shadow-none hover:bg-transparent hover:text-ink"><FolderHeart className="h-4 w-4 stroke-[1.5]" /></Link><AuthControl className="border-0 bg-transparent text-muted shadow-none hover:bg-transparent hover:text-ink [&>svg]:h-4 [&>svg]:w-4" /></div></div>
        <div className="flex w-[140px] shrink-0 items-center justify-end gap-2 sm:hidden">{canEdit && tab !== "outline" ? <AddIconButton context="header" label={tab === "daily" ? "新增行程" : `新增${tab === "place" ? "地點" : "美食"}`} onClick={() => setDialog({ open: true, type: tab === "food" ? "food" : "place", allowTypeChange: tab === "daily", desktopTwoColumn: tab !== "daily" })} /> : <span aria-hidden="true" className="h-11 w-11 shrink-0" />}<Link href={`/trip/${tripId}/resources`} aria-label="旅途資訊" title="旅途資訊" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-searchBackground hover:text-[#555555]"><FolderHeart className="h-4 w-4 stroke-[1.5]" /></Link><AuthControl /></div>
      </header>
      <div className="sm:hidden"><TripPrimaryNav activeTab={tab} onTabChange={setTab} /></div>
      {tab === "daily" && <Daily trip={trip} items={items} canEdit={canEdit} onAdd={(date) => setDialog({ open: true, type: "place", initialDate: date, allowTypeChange: true })} onEdit={edit} onDelete={remove} onReorder={reorder} />}
      {(tab === "place" || tab === "food") && <ItemList type={tab} items={items} query={query} sort={sort} canEdit={canEdit} onQuery={setQuery} onSort={setSort} onAdd={() => setDialog({ open: true, type: tab, desktopTwoColumn: true })} onEdit={editListItem} onDelete={remove} />}
      {tab === "outline" && <Outline trip={trip} items={items} canEdit={canEdit} initialFlights={initialFlights} initialHotelStays={initialHotelStays} initialTransportations={initialTransportations} />}
      <TravelItemDialog open={dialog.open} type={dialog.type} trip={trip} item={dialog.item} items={items} initialDate={dialog.initialDate} allowTypeChange={dialog.allowTypeChange} desktopTwoColumn={dialog.desktopTwoColumn} onTypeChange={(type) => setDialog((value) => ({ ...value, type }))} onOpenChange={(open) => setDialog((value) => ({ ...value, open }))} onSave={async (value) => {
        const { imageFile, ...itemValue } = value;
        try {
          const { cleanupWarning } = await travelRepository.saveItem({ ...itemValue, id: dialog.item?.id, tripId, type: dialog.type, createdBy: dialog.item?.createdBy }, imageFile);
          await refresh();
          setDialog((current) => ({ ...current, open: false }));
          toast.success(dialog.item ? "已更新" : "已新增");
          if (cleanupWarning) toast.warning(cleanupWarning);
        } catch (error) {
          toast.error(errorMessage(error, "儲存失敗"));
        }
      }} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`刪除${deleting?.type === "food" ? "美食" : "地點"}`}
        description={`確定刪除「${deleting?.name ?? ""}」？`}
        onOpenChange={(next) => { if (!next) setDeleting(undefined); }}
        onConfirm={() => {
          if (!deleting) return;
          travelRepository.deleteItem(deleting.id).then(async ({ cleanupWarning }) => {
            await refresh();
            setDeleting(undefined);
            toast.success("已刪除");
            if (cleanupWarning) toast.warning(cleanupWarning);
          }).catch((error) => toast.error(errorMessage(error, "刪除失敗")));
        }}
      />
    </main>
  );
}

function ItemList({ type, items, query, sort, canEdit, onQuery, onSort, onAdd, onEdit, onDelete }: { type: TravelItemType; items: TravelItem[]; query: string; sort: TravelItemSort; canEdit: boolean; onQuery: (value: string) => void; onSort: (value: TravelItemSort) => void; onAdd: () => void; onEdit: (item: TravelItem) => void; onDelete: (item: TravelItem) => void }) {
  const [area, setArea] = useState("");
  const { openItemId, open: openSwipe, close: closeSwipe } = useMobileSwipeGroup();
  const areas = useMemo(() => [...new Set(items.filter((item) => item.type === type).map((item) => item.area.trim()).filter(Boolean))], [items, type]);
  useEffect(() => setArea(""), [type]);
  useEffect(() => closeSwipe(), [area, closeSwipe, query, sort, type]);
  useEffect(() => {
    if (area && !areas.includes(area)) setArea("");
  }, [area, areas]);
  const visible = useMemo(() => items.filter((item) => item.type === type && (!area || item.area.trim() === area) && [item.name, item.category, item.area, item.note].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => {
    const value = sort === "date" ? (a.date ?? "9999-99-99") : a[sort];
    const other = sort === "date" ? (b.date ?? "9999-99-99") : b[sort];
    return value.localeCompare(other, "zh-Hant") || a.createdAt.localeCompare(b.createdAt);
  }), [area, items, query, sort, type]);
  const renderAreaMenu = () => <div className="flex min-w-max flex-nowrap items-center gap-5 pr-4">{["", ...areas].map((value) => <button key={value || "all"} type="button" onClick={() => setArea(value)} aria-pressed={area === value} className={`shrink-0 border-b pb-1 text-xs transition-colors ${area === value ? "border-ink text-ink" : "border-transparent text-muted hover:text-[#555555]"}`}>{value || "全部"}</button>)}</div>;
  const renderControls = (desktop = false) => <><div className="relative min-w-0 flex-1 sm:w-[290px] sm:flex-none"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-muted" /><Input value={query} onChange={(e) => onQuery(e.target.value)} className={`bg-surface pl-11 pr-10 ${desktop ? "h-8" : ""}`} aria-label="搜尋" /><button type="button" onClick={() => onQuery("")} aria-label="清除搜尋" aria-hidden={!query} tabIndex={query ? 0 : -1} disabled={!query} className={`absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-card text-muted transition-[color,opacity] hover:bg-searchBackground hover:text-[#555555] ${query ? "visible opacity-100" : "invisible pointer-events-none opacity-0"}`}><X className="h-4 w-4 stroke-[1.5]" /></button></div><Select value={sort} onValueChange={(value) => onSort(value as TravelItemSort)}><SelectTrigger className={`${desktop ? "h-8 min-w-[112px] w-auto" : "w-[112px]"} shrink-0`}><ArrowUpDown className="h-4 w-4 stroke-[1.5]" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="date">日期</SelectItem><SelectItem value="category">分類</SelectItem><SelectItem value="area">地點</SelectItem></SelectContent></Select></>;
  return <>
    <div className="sm:hidden">
      <nav aria-label={`${type === "place" ? "地點" : "美食"}區域篩選`} className="no-scrollbar mb-8 max-w-full overflow-x-auto pt-5">{renderAreaMenu()}</nav>
      <div className="mb-7 flex gap-2">{renderControls()}</div>
    </div>
    <div className="mb-8 hidden flex-wrap items-center justify-between gap-x-6 gap-y-4 pt-8 sm:flex lg:flex-nowrap">
      <nav aria-label={`${type === "place" ? "地點" : "美食"}區域篩選`} className="no-scrollbar flex h-[42px] w-full flex-none items-center overflow-x-auto pt-0.5 lg:min-w-0 lg:flex-1">{renderAreaMenu()}</nav>
      <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">{renderControls(true)}{canEdit && <AddIconButton label={`新增${type === "place" ? "地點" : "美食"}`} onClick={onAdd} className="h-8 w-8 bg-transparent hover:bg-transparent" />}</div>
    </div>
    {visible.length === 0 ? <EmptyState title={`尚無${type === "place" ? "地點" : "美食"}`} description="" icon="map" /> : <div className="grid grid-cols-1 gap-6 sm:gap-7 lg:grid-cols-2">{visible.map((item) => <ItemCard key={item.id} item={item} canEdit={canEdit} listLayout swipeOpen={openItemId === item.id} onSwipeOpen={() => openSwipe(item.id)} onSwipeClose={closeSwipe} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />)}</div>}
  </>;
}

function ItemCard({ item, canEdit, onEdit, onDelete, controls, compactBusiness = false, listLayout = false, swipeOpen = false, onSwipeOpen = () => undefined, onSwipeClose = () => undefined }: { item: TravelItem; canEdit: boolean; onEdit: () => void; onDelete: () => void; controls?: React.ReactNode; compactBusiness?: boolean; listLayout?: boolean; swipeOpen?: boolean; onSwipeOpen?: () => void; onSwipeClose?: () => void }) {
  const imageUrl = useTravelItemImageUrl(listLayout ? item.imagePath : undefined);
  if (listLayout) {
    const hasMobileFooterLinks = Boolean(item.extraLink1 || item.extraLink2);
    return (
      <>
      <MobileSwipeActions itemId={item.id} canEdit={canEdit} canDelete={canEdit} open={swipeOpen} mobileFrame onOpen={onSwipeOpen} onClose={onSwipeClose} onEdit={onEdit} onDelete={onDelete}>
      <article className="flex min-w-0 flex-col self-start bg-surface px-4 pt-4">
        <header className="flex min-w-0 items-start justify-between gap-4 pb-4">
          <div className="min-w-0 flex-1">
          {item.googleMapsUrl
            ? <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Google Maps 開啟${item.name}`} title="開啟 Google Maps" className="line-clamp-2 font-medium hover:text-[#555555]">{item.name}</a>
            : <p className="line-clamp-2 font-medium">{item.name}</p>}
          </div>
          <div className="flex max-w-[58%] shrink-0 items-center gap-2 text-xs text-ink"><LocationCategory item={item} />{item.date && <><span aria-hidden="true" className="text-border">｜</span><time dateTime={item.date} className="whitespace-nowrap">{displayDate(item.date)}</time></>}</div>
        </header>
        {item.imagePath && <TravelItemCardImage item={item} url={imageUrl} mobile />}
        <section className="flex min-w-0 flex-1 flex-col justify-start gap-3 pb-4">
          <ItemCompactBusinessHours item={item} />
          {item.note && <ClampedNote note={item.note} lines={3} showMarker={false} textClassName={CARD_NOTE_TYPOGRAPHY} />}
        </section>
        {hasMobileFooterLinks && <footer className="mt-auto flex min-h-12 shrink-0 items-center border-t border-divider">
          <div className="ml-auto flex items-center gap-4">
            {item.extraLink1 && <ExternalLinkAction href={item.extraLink1} index={1} />}
            {item.extraLink2 && <ExternalLinkAction href={item.extraLink2} index={2} />}
          </div>
        </footer>}
      </article>
      </MobileSwipeActions>
      <article className="hidden min-h-[220px] min-w-0 flex-col self-stretch rounded-card border border-border bg-surface px-5 pt-5 sm:flex">
        <header className="flex min-w-0 items-start justify-between gap-5 pb-5">
          <div className="min-w-0 flex-1">
            {item.googleMapsUrl
              ? <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Google Maps 開啟${item.name}`} title="開啟 Google Maps" className="line-clamp-2 cursor-pointer font-medium text-ink no-underline transition-colors hover:text-[#666666] hover:no-underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink">{item.name}</a>
              : <p className="line-clamp-2 font-medium text-ink">{item.name}</p>}
          </div>
          {(item.area || item.category || item.date) && <div className="flex max-w-[58%] shrink-0 items-center gap-2 text-xs font-normal leading-4 text-muted"><LocationCategory item={item} />{item.date && <><span aria-hidden="true" className="text-border">｜</span><time dateTime={item.date} className="whitespace-nowrap"><DailyDateLabel date={item.date} /></time></>}</div>}
        </header>
        <div className="flex min-w-0 flex-1 gap-4 pb-5">
          <section className="flex min-w-0 flex-1 flex-col gap-3">
            <ItemCompactBusinessHours item={item} />
            {item.note && <ClampedNote note={item.note} lines={4} showMarker={false} textClassName={CARD_NOTE_TYPOGRAPHY} />}
          </section>
          {item.imagePath && <TravelItemCardImage item={item} url={imageUrl} />}
        </div>
        <footer className="mt-auto flex min-h-12 shrink-0 items-center border-t border-divider/60">
          <div className="flex items-center gap-4">
            {item.extraLink1 && <ExternalLinkAction href={item.extraLink1} index={1} quiet />}
            {item.extraLink2 && <ExternalLinkAction href={item.extraLink2} index={2} quiet />}
          </div>
          {canEdit && <div className="ml-auto flex items-center gap-4"><Action label="編輯" quiet onClick={onEdit}><SquarePen /></Action><Action label="刪除" quiet onClick={onDelete}><Trash2 /></Action></div>}
        </footer>
      </article>
      </>
    );
  }
  return <article className="rounded-card border border-border bg-surface p-6 shadow-soft"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><ItemName item={item} /><p className="mt-2 text-xs text-muted">{item.date ? displayDate(item.date) : "未定"} · {item.category || (item.type === "place" ? "地點" : "美食")}</p></div>{canEdit && <div className="flex shrink-0">{controls}<Action label="編輯" onClick={onEdit}><SquarePen /></Action><Action label="刪除" onClick={onDelete}><Trash2 /></Action></div>}</div><div className="my-4 border-t border-divider" />{item.area && <p className="text-sm text-muted">{item.area}</p>}<BusinessHours item={item} compact={compactBusiness} />{item.note && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{item.note}</p>}</article>;
}

function useTravelItemImageUrl(path?: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    setUrl(undefined);
    if (path) {
      travelRepository.getTravelItemImageUrl(path)
        .then((nextUrl) => { if (active) setUrl(nextUrl); })
        .catch(() => { if (active) setUrl(undefined); });
    }
    return () => { active = false; };
  }, [path]);
  return url;
}

function TravelItemCardImage({ item, url, mobile = false }: { item: TravelItem; url?: string; mobile?: boolean }) {
  return <div className={`${mobile ? "mb-4 aspect-[3/2] w-full" : "h-[140px] w-[210px] shrink-0"} flex items-center justify-center overflow-hidden rounded-card ${item.imageFit === "contain" ? "bg-searchBackground" : "bg-transparent"}`}>
    {/* Signed private Storage URLs cannot be configured as a static Next Image host. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url && <img src={url} alt={item.name} className={`h-full w-full ${item.imageFit === "cover" ? "object-cover" : "object-contain"}`} />}
  </div>;
}

function Daily({ trip, items, canEdit, onAdd, onEdit, onDelete, onReorder }: { trip: Trip; items: TravelItem[]; canEdit: boolean; onAdd: (date: string) => void; onEdit: (item: TravelItem) => void; onDelete: (item: TravelItem) => void; onReorder: (activeId: string, overId: string) => void }) {
  const dates = tripDates(trip);
  const [activeDate, setActiveDate] = useState(trip.startDate);
  const [openSwipeItemId, setOpenSwipeItemId] = useState<string>();
  useEffect(() => setActiveDate(trip.startDate), [trip.startDate]);
  useEffect(() => {
    if (!openSwipeItemId) return;
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      const card = target instanceof Element ? target.closest("[data-mobile-swipe-card]") : null;
      if (card?.getAttribute("data-mobile-swipe-card") !== openSwipeItemId) setOpenSwipeItemId(undefined);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [openSwipeItemId]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } })
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };
  const jumpToDate = (date: string) => {
    setActiveDate(date);
    document.getElementById(`daily-${date}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  return <><nav aria-label="快速跳轉日期" className="no-scrollbar mb-8 max-w-full overflow-x-auto pt-5 sm:pt-6"><div className="flex min-w-max flex-nowrap items-center gap-5 pr-4">{dates.map((date) => <button key={date} type="button" onClick={() => jumpToDate(date)} aria-current={activeDate === date ? "date" : undefined} className={`shrink-0 border-b pb-1 text-xs transition-colors ${activeDate === date ? "border-muted text-ink" : "border-transparent text-muted hover:text-[#555555]"}`}><DailyDateLabel date={date} /></button>)}</div></nav><div className="space-y-8">{dates.map((date) => { const day = items.filter((item) => item.date === date).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)); return <section id={`daily-${date}`} className="scroll-mt-36" key={date}><div className="mb-4 flex items-center justify-between"><h2 className="text-title font-semibold"><DailyDateLabel date={date} /></h2>{canEdit && <AddIconButton label={`新增 ${displayDate(date)} 行程`} onClick={() => onAdd(date)} />}</div>{day.length === 0 ? <EmptyState title="今天尚未安排" description="" /> : canEdit ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setOpenSwipeItemId(undefined)} onDragEnd={handleDragEnd}><SortableContext items={day.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="space-y-3">{day.map((item) => <SortableDailyCard key={item.id} item={item} swipeOpen={openSwipeItemId === item.id} onSwipeOpen={() => setOpenSwipeItemId(item.id)} onSwipeClose={() => setOpenSwipeItemId((current) => current === item.id ? undefined : current)} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />)}</div></SortableContext></DndContext> : <div className="space-y-3">{day.map((item) => <DailyCard key={item.id} item={item} canEdit={false} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />)}</div>}</section>; })}</div></>;
}

function DailyDateLabel({ date }: { date: string }) {
  const [month, day] = displayDate(date).split("/");
  return <span className="inline-flex whitespace-nowrap"><span>{month}</span><span aria-hidden="true" className="mx-1">/</span><span>{day}</span></span>;
}

function SortableDailyCard({ item, swipeOpen, onSwipeOpen, onSwipeClose, onEdit, onDelete }: { item: TravelItem; swipeOpen: boolean; onSwipeOpen: () => void; onSwipeClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!isDailyCardInteractiveTarget(event.target)) listeners?.onMouseDown?.(event);
  };
  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isDailyCardInteractiveTarget(event.target)) listeners?.onTouchStart?.(event);
  };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} className={`cursor-grab touch-auto active:cursor-grabbing ${isDragging ? "relative z-10 opacity-70" : ""}`}><DailyCard item={item} canEdit swipeOpen={swipeOpen} swipeDragging={isDragging} onSwipeOpen={onSwipeOpen} onSwipeClose={onSwipeClose} onEdit={onEdit} onDelete={onDelete} /></div>;
}

function DailyCard({ item, canEdit, swipeOpen = false, swipeDragging = false, onSwipeOpen = () => undefined, onSwipeClose = () => undefined, onEdit, onDelete }: { item: TravelItem; canEdit: boolean; swipeOpen?: boolean; swipeDragging?: boolean; onSwipeOpen?: () => void; onSwipeClose?: () => void; onEdit: () => void; onDelete: () => void }) {
  return <article className="h-full rounded-card border border-border bg-surface shadow-soft">
    <MobileDailySwipeActions itemId={item.id} enabled={canEdit} open={swipeOpen} dragging={swipeDragging} onOpen={onSwipeOpen} onClose={onSwipeClose} onEdit={onEdit} onDelete={onDelete}>
      <div className="grid min-h-[130px] min-w-0 grid-cols-[72px_minmax(0,1fr)_56px]">
        <div className="flex items-center justify-center"><TypeMark item={item} large /></div>
        <DailyDesktopInfo item={item} />
        <DailyExternalLinks item={item} />
      </div>
      {item.note && <div className="border-t border-divider/60 px-6 py-3"><ClampedNote note={item.note} lines={1} showMarker={false} moreLabel="more+" inlineMore textClassName={CARD_NOTE_TYPOGRAPHY} /></div>}
    </MobileDailySwipeActions>
    <div className="hidden min-h-[130px] min-w-0 grid-cols-[56px_208px_minmax(0,1fr)_56px_56px] sm:grid md:grid-cols-[64px_264px_minmax(0,1fr)_64px_64px] lg:grid-cols-[72px_288px_minmax(0,1fr)_72px_72px] xl:grid-cols-[72px_336px_minmax(0,1fr)_72px_72px]">
      <div className="flex items-center justify-center"><TypeMark item={item} /></div>
      <DailyDesktopInfo item={item} />
      <div className="min-w-0 border-l border-divider/60 px-4 pt-[27px] md:px-5">{item.note && <div className="min-w-0"><ClampedNote note={item.note} lines={3} textClassName={CARD_NOTE_TYPOGRAPHY} showMarker={false} /></div>}</div>
      <DailyExternalLinks item={item} />
      <DailyDesktopManageActions canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
    </div>
  </article>;
}

function DailyDesktopInfo({ item }: { item: TravelItem }) {
  const status = item.businessHours ? getBusinessStatus(item.businessHours) : null;
  return <div className="flex min-w-0 flex-col justify-center border-l border-divider/60 px-[15px]">
    <DailyItemName item={item} />
    {(item.area || item.category) && <div className="mt-[14px] text-xs leading-4 text-muted"><LocationCategory item={item} wrapOnDesktop /></div>}
    {item.businessHours && <div className="mt-[10px] flex min-w-0 flex-wrap items-center gap-2 text-xs leading-4 text-muted"><Clock3 className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{item.businessHours}</span>{status && <BusinessStatusLabel status={status} desktopEnglish desktopCompact />}</div>}
  </div>;
}

function LocationCategory({ item, wrapOnDesktop = false }: { item: TravelItem; wrapOnDesktop?: boolean }) {
  return <span className={`min-w-0 max-w-full truncate ${wrapOnDesktop ? "sm:overflow-visible sm:whitespace-normal sm:text-clip sm:break-words" : ""}`}>{[item.area, item.category].filter(Boolean).join(" ｜ ")}</span>;
}

function TypeMark({ item, large = false }: { item: TravelItem; large?: boolean }) {
  const isShop = item.type === "place" && item.category === "店";
  const label = item.type === "food" ? "食" : isShop ? "店" : "景";
  const accent = item.type === "food" ? "bg-travelType-food" : isShop ? "bg-travelType-shop" : "bg-travelType-place";
  return <span className="flex w-12 min-w-12 shrink-0 flex-col items-center justify-center text-ink"><span className={`${large ? "text-title" : "text-base"} font-medium leading-none`}>{label}</span><span aria-hidden="true" className={`mt-[11px] h-[3px] w-8 rounded-[2px] ${accent}`} /></span>;
}

function DailyItemName({ item }: { item: TravelItem }) {
  const className = "line-clamp-2 min-w-0 font-medium";
  return item.googleMapsUrl
    ? <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Google Maps 開啟${item.name}`} title="開啟 Google Maps" data-no-dnd onPointerDown={stopDrag} className={`${className} cursor-pointer text-ink no-underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink sm:hover:text-[#666666] sm:hover:no-underline`}>{item.name}</a>
    : <p className={className}>{item.name}</p>;
}

function DailyExternalLinks({ item }: { item: TravelItem }) {
  return <div className="flex flex-col items-center justify-center gap-1 border-l border-divider/60" data-no-dnd>{item.extraLink1 && <ExternalLinkAction href={item.extraLink1} index={1} quiet />}{item.extraLink2 && <ExternalLinkAction href={item.extraLink2} index={2} quiet />}</div>;
}

function DailyDesktopManageActions({ canEdit, onEdit, onDelete }: { canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  return <div className="flex flex-col items-center justify-center gap-1 border-l border-divider/60" data-no-dnd>{canEdit && <><Action label="編輯" smallIcon quiet onPointerDown={stopDrag} onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon quiet onPointerDown={stopDrag} onClick={onDelete}><Trash2 /></Action></>}</div>;
}

function stopDrag(event: React.SyntheticEvent) { event.stopPropagation(); }

function Outline({ trip, items, canEdit, initialFlights, initialHotelStays, initialTransportations }: { trip: Trip; items: TravelItem[]; canEdit: boolean; initialFlights: Flight[]; initialHotelStays: HotelStay[]; initialTransportations: Transportation[] }) {
  const [flights, setFlights] = useState<Flight[]>(initialFlights);
  const [hotelStays, setHotelStays] = useState<HotelStay[]>(initialHotelStays);
  const [transportations, setTransportations] = useState<Transportation[]>(initialTransportations);
  const [flightDialog, setFlightDialog] = useState<{ open: boolean; flight?: Flight }>({ open: false });
  const [hotelDialog, setHotelDialog] = useState<{ open: boolean; stay?: HotelStay }>({ open: false });
  const [transportationDialog, setTransportationDialog] = useState<{ open: boolean; transportation?: Transportation }>({ open: false });
  const [deleting, setDeleting] = useState<{ kind: "flight"; value: Flight } | { kind: "hotel"; value: HotelStay } | { kind: "transportation"; value: Transportation }>();
  const [activeSection, setActiveSection] = useState("flight");
  const { openItemId, open: openSwipe, close: closeSwipe } = useMobileSwipeGroup();
  const refresh = useCallback(async () => {
    try {
      const [nextFlights, nextHotels, nextTransportations] = await Promise.all([travelRepository.getFlights(trip.id), travelRepository.getHotelStays(trip.id), travelRepository.getTransportations(trip.id)]);
      setFlights(nextFlights);
      setHotelStays(nextHotels);
      setTransportations(nextTransportations);
    } catch (error) {
      toast.error(errorMessage(error, "無法載入行程大綱"));
    }
  }, [trip.id]);
  const sections = [...tripDates(trip).map((date) => ({ date, items: items.filter((item) => item.date === date) })), { date: undefined, items: items.filter((item) => !item.date) }];
  const sortedFlights = [...flights].sort((a, b) => `${a.departureDate}T${a.departureTime}`.localeCompare(`${b.departureDate}T${b.departureTime}`) || a.createdAt.localeCompare(b.createdAt));
  const sortedStays = [...hotelStays].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate) || a.createdAt.localeCompare(b.createdAt));
  const sortedTransportations = [...transportations].sort((a, b) => `${a.startDate}T${a.startTime}`.localeCompare(`${b.startDate}T${b.startTime}`) || a.createdAt.localeCompare(b.createdAt));
  const navigation = [{ value: "flight", label: "機票" }, { value: "hotel", label: "住宿" }, { value: "transportation", label: "交通" }, { value: "itinerary", label: "行程" }];
  const jumpToSection = (section: string) => {
    setActiveSection(section);
    document.getElementById(`outline-${section}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  return <>
    <nav aria-label="大綱快速導覽" className="no-scrollbar mb-8 max-w-full overflow-x-auto pt-5 sm:pt-6"><div className="flex min-w-max flex-nowrap items-center gap-5 pr-4">{navigation.map(({ value, label }) => <button key={value} type="button" onClick={() => jumpToSection(value)} aria-current={activeSection === value ? "location" : undefined} className={`shrink-0 border-b pb-1 text-xs transition-colors ${activeSection === value ? "border-muted text-ink" : "border-transparent text-muted hover:text-[#555555]"}`}>{label}</button>)}</div></nav>
    <div className="space-y-12">
      <OutlineDetailsSection id="outline-flight" icon={Plane} label="機票" addLabel="新增機票" canEdit={canEdit} onAdd={() => setFlightDialog({ open: true })}>
        {sortedFlights.length > 0 && <div className="grid grid-cols-1 gap-6 md:grid-cols-2">{sortedFlights.map((flight) => <FlightCard key={flight.id} flight={flight} canEdit={canEdit} swipeOpen={openItemId === `flight-${flight.id}`} onSwipeOpen={() => openSwipe(`flight-${flight.id}`)} onSwipeClose={closeSwipe} onEdit={() => setFlightDialog({ open: true, flight })} onDelete={() => setDeleting({ kind: "flight", value: flight })} />)}</div>}
      </OutlineDetailsSection>
      <OutlineDetailsSection id="outline-hotel" icon={Hotel} label="住宿" addLabel="新增飯店" canEdit={canEdit} onAdd={() => setHotelDialog({ open: true })}>
        {sortedStays.length > 0 && <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{sortedStays.map((stay) => <HotelStayCard key={stay.id} stay={stay} canEdit={canEdit} swipeOpen={openItemId === `hotel-${stay.id}`} onSwipeOpen={() => openSwipe(`hotel-${stay.id}`)} onSwipeClose={closeSwipe} onEdit={() => setHotelDialog({ open: true, stay })} onDelete={() => setDeleting({ kind: "hotel", value: stay })} />)}</div>}
      </OutlineDetailsSection>
      <OutlineDetailsSection id="outline-transportation" icon={CarFront} label="交通" addLabel="新增交通" canEdit={canEdit} onAdd={() => setTransportationDialog({ open: true })}>
        {sortedTransportations.length > 0 && <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{sortedTransportations.map((transportation) => <TransportationCard key={transportation.id} transportation={transportation} canEdit={canEdit} swipeOpen={openItemId === `transportation-${transportation.id}`} onSwipeOpen={() => openSwipe(`transportation-${transportation.id}`)} onSwipeClose={closeSwipe} onEdit={() => setTransportationDialog({ open: true, transportation })} onDelete={() => setDeleting({ kind: "transportation", value: transportation })} />)}</div>}
      </OutlineDetailsSection>
      <section id="outline-itinerary" className="scroll-mt-36"><header className="mb-6 flex items-center"><CalendarDays className="h-4 w-4 text-muted" /><h2 className="ml-3 text-sm font-semibold tracking-body">行程</h2></header><div className="space-y-8">{sections.filter((section) => section.items.length > 0).map((section) => <section key={section.date ?? "undated"}><h3 className="mb-4 text-title font-semibold">{section.date ? <DailyDateLabel date={section.date} /> : "未定"}</h3><div className="rounded-card border border-border bg-surface px-6 shadow-soft">{section.items.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)).map((item, index) => <div key={item.id} className={`flex items-center gap-3 py-4 ${index ? "border-t border-divider" : ""}`}>{item.type === "place" ? <MapPin className="h-4 w-4 text-muted" /> : <UtensilsCrossed className="h-4 w-4 text-muted" />}<ItemName item={item} /></div>)}</div></section>)}</div></section>
    </div>
    <FlightDialog open={flightDialog.open} flight={flightDialog.flight} onOpenChange={(open) => setFlightDialog((current) => ({ ...current, open }))} onSave={(value) => { travelRepository.saveFlight({ ...value, id: flightDialog.flight?.id, tripId: trip.id }).then(() => refresh()).then(() => { setFlightDialog({ open: false }); toast.success(flightDialog.flight ? "已更新機票" : "已新增機票"); }).catch((error) => toast.error(errorMessage(error, "機票儲存失敗"))); }} />
    <HotelStayDialog open={hotelDialog.open} stay={hotelDialog.stay} onOpenChange={(open) => setHotelDialog((current) => ({ ...current, open }))} onSave={(value) => { travelRepository.saveHotelStay({ ...value, id: hotelDialog.stay?.id, tripId: trip.id }).then(() => refresh()).then(() => { setHotelDialog({ open: false }); toast.success(hotelDialog.stay ? "已更新飯店" : "已新增飯店"); }).catch((error) => toast.error(errorMessage(error, "飯店儲存失敗"))); }} />
    <TransportationDialog open={transportationDialog.open} transportation={transportationDialog.transportation} onOpenChange={(open) => setTransportationDialog((current) => ({ ...current, open }))} onSave={(value) => { travelRepository.saveTransportation({ ...value, id: transportationDialog.transportation?.id, tripId: trip.id }).then(() => refresh()).then(() => { setTransportationDialog({ open: false }); toast.success(transportationDialog.transportation ? "已更新交通" : "已新增交通"); }).catch((error) => toast.error(errorMessage(error, "交通儲存失敗"))); }} />
    <ConfirmDialog open={Boolean(deleting)} title={`刪除${deleting?.kind === "flight" ? "機票" : deleting?.kind === "hotel" ? "飯店" : "交通"}`} description={`確定刪除「${deleting ? deleteLabel(deleting) : ""}」？`} onOpenChange={(open) => { if (!open) setDeleting(undefined); }} onConfirm={() => { if (!deleting) return; const action = deleting.kind === "flight" ? travelRepository.deleteFlight(deleting.value.id) : deleting.kind === "hotel" ? travelRepository.deleteHotelStay(deleting.value.id) : travelRepository.deleteTransportation(deleting.value.id); action.then(() => refresh()).then(() => { setDeleting(undefined); toast.success("已刪除"); }).catch((error) => toast.error(errorMessage(error, "刪除失敗"))); }} />
  </>;
}

function OutlineDetailsSection({ id, icon: Icon, label, addLabel, canEdit, onAdd, children }: { id: string; icon: typeof Plane; label: string; addLabel: string; canEdit: boolean; onAdd: () => void; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-36"><header className="mb-4 flex items-center"><Icon className="h-4 w-4 text-muted" /><h2 className="ml-3 text-sm font-semibold tracking-body">{label}</h2>{canEdit && <AddIconButton label={addLabel} onClick={onAdd} className="ml-auto" />}</header>{children}</section>;
}

function FlightCard({ flight, canEdit, swipeOpen, onSwipeOpen, onSwipeClose, onEdit, onDelete }: { flight: Flight; canEdit: boolean; swipeOpen: boolean; onSwipeOpen: () => void; onSwipeClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const crossesDate = flight.departureDate !== flight.arrivalDate;
  return <MobileSwipeActions itemId={`flight-${flight.id}`} canEdit={canEdit} canDelete={canEdit} open={swipeOpen} desktopPassthrough mobileFrame onOpen={onSwipeOpen} onClose={onSwipeClose} onEdit={onEdit} onDelete={onDelete}>
  <article className="flex min-w-0 flex-col bg-surface px-6 pt-6 sm:rounded-card sm:border sm:border-border sm:shadow-soft">
    <header className="flex min-w-0 items-center justify-between gap-4 pb-5"><div className="flex min-w-0 items-center gap-4"><span className="truncate font-medium">{flight.airline}</span><span className="shrink-0 text-sm text-muted">{flight.flightNumber}</span></div><div className="flex min-w-0 shrink-0 items-center gap-2 text-sm text-muted"><span className="max-w-20 truncate sm:max-w-none">{flight.departurePlace}</span><ChevronRight className="h-4 w-4 shrink-0" /><span className="max-w-20 truncate sm:max-w-none">{flight.arrivalPlace}</span></div></header>
    <div className="border-t border-divider" />
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 py-6"><div className="shrink-0 text-sm text-muted"><time dateTime={flight.departureDate}><DailyDateLabel date={flight.departureDate} /></time>{crossesDate && <><span className="mx-2">–</span><time dateTime={flight.arrivalDate}><DailyDateLabel date={flight.arrivalDate} /></time></>}</div><div className="flex items-center gap-3 text-title font-medium"><time dateTime={flight.departureTime}>{flight.departureTime}</time><ChevronRight className="h-4 w-4 text-muted" /><time dateTime={flight.arrivalTime}>{flight.arrivalTime}</time></div></div>
    {flight.note && <div className="pb-5"><ClampedNote note={flight.note} lines={2} /></div>}
    <footer className={`${flight.link ? "flex" : "hidden"} mt-auto h-14 items-center border-t border-divider sm:flex`}><div>{flight.link && <ExternalLinkAction href={flight.link} index={1} />}</div>{canEdit && <div className="ml-auto hidden items-center gap-4 sm:flex"><Action label="編輯" smallIcon onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon onClick={onDelete}><Trash2 /></Action></div>}</footer>
  </article>
  </MobileSwipeActions>;
}

function HotelStayCard({ stay, canEdit, swipeOpen, onSwipeOpen, onSwipeClose, onEdit, onDelete }: { stay: HotelStay; canEdit: boolean; swipeOpen: boolean; onSwipeOpen: () => void; onSwipeClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const hasTimes = stay.checkInTime || stay.checkOutTime;
  return <MobileSwipeActions itemId={`hotel-${stay.id}`} canEdit={canEdit} canDelete={canEdit} open={swipeOpen} desktopPassthrough mobileFrame onOpen={onSwipeOpen} onClose={onSwipeClose} onEdit={onEdit} onDelete={onDelete}>
  <article className="flex min-w-0 flex-col bg-surface px-6 pt-6 sm:rounded-card sm:border sm:border-border sm:shadow-soft">
    {stay.googleMapsUrl && <a href={stay.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Google Maps 開啟${stay.name}`} title="開啟 Google Maps" className="line-clamp-2 font-medium text-ink no-underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink sm:hidden">{stay.name}</a>}
    <h3 className={`line-clamp-2 font-medium ${stay.googleMapsUrl ? "hidden sm:block" : ""}`}>{stay.name}</h3>
    <div className="mt-5 border-t border-divider" />
    <div className="space-y-4 py-6"><p className="text-center font-medium"><time dateTime={stay.checkInDate}><DailyDateLabel date={stay.checkInDate} /></time><span className="mx-3 text-muted">–</span><time dateTime={stay.checkOutDate}><DailyDateLabel date={stay.checkOutDate} /></time></p>
      {hasTimes && <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 rounded-pill bg-searchBackground px-4 py-2 text-sm text-muted">{stay.checkInTime && <span>入住&nbsp; {stay.checkInTime}</span>}{stay.checkOutTime && <span>退房&nbsp; {stay.checkOutTime}</span>}</div>}
      {stay.address && <ContactRow label="地址" value={stay.address} />}{stay.phone && <ContactRow label="電話" value={stay.phone} />}{stay.note && <ClampedNote note={stay.note} lines={2} />}
    </div>
    <footer className={`${stay.link ? "flex" : "hidden"} mt-auto h-14 items-center border-t border-divider sm:flex`}><div className="ml-auto flex items-center gap-4 sm:ml-0">{stay.link && <ExternalLinkAction href={stay.link} index={1} />}{stay.googleMapsUrl && <a href={stay.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="開啟 Google Maps" title="開啟 Google Maps" className="hidden h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-[#555555] sm:flex sm:h-9 sm:w-9"><Navigation className="h-4 w-4" /></a>}</div>{canEdit && <div className="ml-auto hidden items-center gap-4 sm:flex"><Action label="編輯" smallIcon onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon onClick={onDelete}><Trash2 /></Action></div>}</footer>
  </article>
  </MobileSwipeActions>;
}

function TransportationCard({ transportation, canEdit, swipeOpen, onSwipeOpen, onSwipeClose, onEdit, onDelete }: { transportation: Transportation; canEdit: boolean; swipeOpen: boolean; onSwipeOpen: () => void; onSwipeClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const isRental = transportation.type === "rental_car";
  const title = isRental ? transportation.company : transportation.routeName;
  const secondary = isRental ? transportation.vehicleModel : transportation.trainNumber;
  const crossesDate = transportation.startDate !== transportation.endDate;
  const details = (isRental
    ? [["地址", transportation.address], ["費用", transportation.cost]]
    : [["座位", transportation.seat], ["車廂", transportation.carriage], ["車票", transportation.ticket], ["費用", transportation.cost]])
    .filter((detail): detail is [string, string] => Boolean(detail[1]));
  return <MobileSwipeActions itemId={`transportation-${transportation.id}`} canEdit={canEdit} canDelete={canEdit} open={swipeOpen} desktopPassthrough mobileFrame onOpen={onSwipeOpen} onClose={onSwipeClose} onEdit={onEdit} onDelete={onDelete}>
  <article className="flex min-w-0 flex-col bg-surface px-6 pt-6 sm:rounded-card sm:border sm:border-border sm:shadow-soft">
    <header className="flex min-w-0 items-center justify-between gap-4 pb-5"><div className="flex min-w-0 items-center gap-4"><h3 className="min-w-0 truncate font-medium">{title}</h3>{secondary && <span className="min-w-0 truncate text-sm text-muted">{secondary}</span>}</div>{transportation.reservationNumber && <span className="max-w-24 shrink-0 truncate text-sm text-muted sm:max-w-40">{transportation.reservationNumber}</span>}</header>
    <div className="border-t border-divider" />
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 py-6"><div className="shrink-0 text-sm text-muted"><time dateTime={transportation.startDate}><DailyDateLabel date={transportation.startDate} /></time></div><div className="flex items-center gap-3 text-title font-medium"><time dateTime={transportation.startTime}>{transportation.startTime}</time><ChevronRight className="h-4 w-4 text-muted" />{crossesDate && <time dateTime={transportation.endDate} className="text-sm font-normal text-muted"><DailyDateLabel date={transportation.endDate} /></time>}<time dateTime={transportation.endTime}>{transportation.endTime}</time></div></div>
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-pill bg-searchBackground px-4 py-2 text-sm text-muted"><span className="min-w-0 truncate">{transportation.departurePlace}</span><span className="min-w-0 truncate text-right">{transportation.arrivalPlace}</span></div>
    <div className="space-y-4 py-6">{details.map(([label, value]) => <ContactRow key={label} label={label} value={value} />)}{transportation.note && <ClampedNote note={transportation.note} lines={2} />}</div>
    <footer className={`${transportation.link || (isRental && transportation.googleMapsUrl) ? "flex" : "hidden"} mt-auto h-14 items-center border-t border-divider sm:flex`}><div className="flex items-center gap-4">{transportation.link && <ExternalLinkAction href={transportation.link} index={1} />}{isRental && transportation.googleMapsUrl && <a href={transportation.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="開啟取車地點 Google Maps" title="開啟取車地點 Google Maps" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-[#555555] sm:h-9 sm:w-9"><Navigation className="h-4 w-4" /></a>}</div>{canEdit && <div className="ml-auto hidden items-center gap-4 sm:flex"><Action label="編輯" smallIcon onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon onClick={onDelete}><Trash2 /></Action></div>}</footer>
  </article>
  </MobileSwipeActions>;
}

function deleteLabel(deleting: { kind: "flight"; value: Flight } | { kind: "hotel"; value: HotelStay } | { kind: "transportation"; value: Transportation }) {
  if (deleting.kind === "flight") return `${deleting.value.airline} ${deleting.value.flightNumber}`;
  if (deleting.kind === "hotel") return deleting.value.name;
  return deleting.value.type === "rental_car" ? `${deleting.value.company} ${deleting.value.vehicleModel}` : deleting.value.routeName;
}

function ContactRow({ label, value }: { label: string; value: string }) {
  return <div className="grid min-w-0 grid-cols-[42px_minmax(0,1fr)] gap-3 text-sm"><span className="font-medium tracking-body">{label}</span><p className="break-words border-l border-divider pl-3 text-muted">{value}</p></div>;
}

function ItemName({ item }: { item: TravelItem }) { return item.googleMapsUrl ? <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-medium hover:text-[#555555]"><span>{item.name}</span><MapPinned className="h-4 w-4 shrink-0" /></a> : <p className="font-medium">{item.name}</p>; }
function ItemCompactBusinessHours({ item }: { item: TravelItem }) {
  if (!item.businessHours) return null;
  const status = getBusinessStatus(item.businessHours);
  return <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs leading-[1.65] text-muted"><Clock3 className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{item.businessHours}</span>{status && <BusinessStatusLabel status={status} desktopEnglish desktopCompact />}</div>;
}
function BusinessHours({ item, compact, flush = false }: { item: TravelItem; compact: boolean; flush?: boolean }) {
  if (!item.businessHours) return null;
  const status = getBusinessStatus(item.businessHours);
  return <div className={`flex min-w-0 flex-wrap items-center gap-2 leading-4 text-muted ${compact ? `${flush ? "" : "mt-2"} text-xs` : `${flush ? "" : "mt-3"} text-sm`}`}><Clock3 className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{item.businessHours}</span>{status && <BusinessStatusLabel status={status} />}</div>;
}
function BusinessStatusLabel({ status, desktopEnglish = false, desktopCompact = false }: { status: BusinessStatus; desktopEnglish?: boolean; desktopCompact?: boolean }) {
  const values = {
    open: { label: "營業中", desktopLabel: "OPEN", mobileLabel: "營", className: "bg-[#e8f2c7]" },
    "closing-soon": { label: "即將打烊", desktopLabel: "OPEN", mobileLabel: "營", className: "bg-[#eaeaea]" },
    closed: { label: "已打烊", desktopLabel: "CLOSE", mobileLabel: "休", className: "bg-[#f9e8ed]" },
  } as const;
  const value = values[status];
  return <span className={`inline-flex shrink-0 items-center rounded-[5px] text-[#333333] ${desktopCompact ? "h-[15px] px-[7px] py-0 text-[9px] leading-[15px]" : "px-2 py-0.5 text-[11px] leading-4"} ${value.className}`}>{desktopEnglish ? value.desktopLabel : <><span className="sm:hidden">{value.mobileLabel}</span><span className="hidden sm:inline">{value.label}</span></>}</span>;
}
function ExternalLinkAction({ href, index, quiet = false }: { href: string; index: 1 | 2; quiet?: boolean }) {
  const label = `開啟其他連結 ${index}`;
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} onPointerDown={stopDrag} className={`flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-[#555555] sm:h-9 sm:w-9 ${quiet ? "bg-transparent hover:bg-transparent" : "hover:bg-bg"}`}><Link2 className="h-4 w-4" /></a>;
}
function Action({ label, onClick, onPointerDown, children, disabled, quiet = false }: { label: string; onClick: () => void; onPointerDown?: React.PointerEventHandler<HTMLButtonElement>; children: React.ReactElement; disabled?: boolean; smallIcon?: boolean; quiet?: boolean }) { return <button type="button" aria-label={label} title={label} disabled={disabled} onPointerDown={onPointerDown} onClick={onClick} className={`flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-[#555555] disabled:opacity-30 sm:h-9 sm:w-9 ${quiet ? "border-0 bg-transparent shadow-none hover:bg-transparent" : "hover:bg-bg"}`}><span className="[&>svg]:h-4 [&>svg]:w-4">{children}</span></button>; }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
