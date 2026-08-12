"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpDown, CalendarDays, CarFront, ChevronRight, Clock3, Hotel, Link2, MapPin, MapPinned, Navigation, NotebookTabs, Plane, Search, SquarePen, Trash2, UtensilsCrossed, X } from "lucide-react";
import { closestCenter, DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { AuthControl } from "@/components/auth-control";
import { AddIconButton } from "@/components/add-icon-button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FlightDialog } from "@/components/flight-dialog";
import { HotelStayDialog } from "@/components/hotel-stay-dialog";
import { TransportationDialog } from "@/components/transportation-dialog";
import { TravelItemDialog } from "@/components/travel-item-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayDate, tripDates } from "@/lib/travel-dates";
import { getBusinessStatus, type BusinessStatus } from "@/lib/business-hours";
import { useAuth } from "@/lib/auth-context";
import { travelRepository } from "@/lib/travel-repository";
import type { Flight, HotelStay, Transportation, TravelItem, TravelItemSort, TravelItemType, Trip, TripRole } from "@/lib/types";

type Tab = "daily" | "place" | "food" | "outline";
const CARD_SECTION_SPACING = "pb-6";

export function TripWorkspace({ tripId, initialTrip, initialItems, initialFlights, initialHotelStays, initialTransportations }: {
  tripId: string;
  initialTrip?: Trip;
  initialItems: TravelItem[];
  initialFlights: Flight[];
  initialHotelStays: HotelStay[];
  initialTransportations: Transportation[];
}) {
  const { user, ready: authReady } = useAuth();
  const [trip, setTrip] = useState<Trip | undefined>(initialTrip);
  const [items, setItems] = useState<TravelItem[]>(initialItems);
  const [role, setRole] = useState<TripRole>();
  const [tab, setTab] = useState<Tab>("daily");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TravelItemSort>("date");
  const [dialog, setDialog] = useState<{ open: boolean; type: TravelItemType; item?: TravelItem; initialDate?: string; allowTypeChange?: boolean }>({ open: false, type: "place" });
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
  const edit = (item: TravelItem) => setDialog({ open: true, type: item.type, item });
  const remove = (item: TravelItem) => setDeleting(item);
  const canEdit = Boolean(role);

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

  if (!trip) return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Link href="/" className="flex items-center gap-2 text-sm text-muted"><ArrowLeft className="h-5 w-5" />返回</Link><EmptyState title="找不到這趟旅行" description="" /></main>;
  const tabs: { value: Tab; label: string; icon: typeof CalendarDays }[] = [
    { value: "daily", label: "每日", icon: CalendarDays }, { value: "place", label: "地點", icon: MapPin },
    { value: "food", label: "美食", icon: UtensilsCrossed }, { value: "outline", label: "大綱", icon: NotebookTabs },
  ];
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-8 border-b border-border bg-bg/90 px-4 pb-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mb-4 flex items-center gap-3"><Link href="/" aria-label="返回" title="返回" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink sm:h-9 sm:w-9"><ArrowLeft className="h-5 w-5" /></Link><h1 className="min-w-0 flex-1 truncate text-title font-semibold">{trip.name}</h1><div className="flex w-[96px] shrink-0 items-center justify-end gap-2">{canEdit && tab !== "outline" ? <AddIconButton context="header" label={tab === "daily" ? "新增行程" : `新增${tab === "place" ? "地點" : "美食"}`} onClick={() => setDialog({ open: true, type: tab === "food" ? "food" : "place", allowTypeChange: tab === "daily" })} /> : <span aria-hidden="true" className="h-11 w-11 shrink-0" />}<AuthControl /></div></div>
        <nav className="grid grid-cols-4 gap-1 rounded-card bg-searchBackground p-1" aria-label="旅程分頁">{tabs.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => setTab(value)} className={`flex h-9 items-center justify-center gap-2 rounded-lg text-sm transition-colors ${tab === value ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink"}`}><Icon className="h-5 w-5" /><span>{label}</span></button>)}</nav>
      </header>
      {tab === "daily" && <Daily trip={trip} items={items} canEdit={canEdit} onAdd={(date) => setDialog({ open: true, type: "place", initialDate: date, allowTypeChange: true })} onEdit={edit} onDelete={remove} onReorder={reorder} />}
      {(tab === "place" || tab === "food") && <ItemList type={tab} items={items} query={query} sort={sort} canEdit={canEdit} onQuery={setQuery} onSort={setSort} onEdit={edit} onDelete={remove} />}
      {tab === "outline" && <Outline trip={trip} items={items} canEdit={canEdit} initialFlights={initialFlights} initialHotelStays={initialHotelStays} initialTransportations={initialTransportations} />}
      <TravelItemDialog open={dialog.open} type={dialog.type} trip={trip} item={dialog.item} items={items} initialDate={dialog.initialDate} allowTypeChange={dialog.allowTypeChange} onTypeChange={(type) => setDialog((value) => ({ ...value, type }))} onOpenChange={(open) => setDialog((value) => ({ ...value, open }))} onSave={(value) => {
        travelRepository.saveItem({ ...value, id: dialog.item?.id, tripId, type: dialog.type, createdBy: dialog.item?.createdBy }).then(() => refresh()).then(() => { setDialog((current) => ({ ...current, open: false })); toast.success(dialog.item ? "已更新" : "已新增"); }).catch((error) => toast.error(errorMessage(error, "儲存失敗")));
      }} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`刪除${deleting?.type === "food" ? "美食" : "地點"}`}
        description={`確定刪除「${deleting?.name ?? ""}」？`}
        onOpenChange={(next) => { if (!next) setDeleting(undefined); }}
        onConfirm={() => {
          if (!deleting) return;
          travelRepository.deleteItem(deleting.id).then(() => refresh()).then(() => { setDeleting(undefined); toast.success("已刪除"); }).catch((error) => toast.error(errorMessage(error, "刪除失敗")));
        }}
      />
    </main>
  );
}

function ItemList({ type, items, query, sort, canEdit, onQuery, onSort, onEdit, onDelete }: { type: TravelItemType; items: TravelItem[]; query: string; sort: TravelItemSort; canEdit: boolean; onQuery: (value: string) => void; onSort: (value: TravelItemSort) => void; onEdit: (item: TravelItem) => void; onDelete: (item: TravelItem) => void }) {
  const visible = useMemo(() => items.filter((item) => item.type === type && [item.name, item.category, item.area, item.note].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => {
    const value = sort === "date" ? (a.date ?? "9999-99-99") : a[sort];
    const other = sort === "date" ? (b.date ?? "9999-99-99") : b[sort];
    return value.localeCompare(other, "zh-Hant") || a.createdAt.localeCompare(b.createdAt);
  }), [items, query, sort, type]);
  return <><div className="mb-6 flex gap-2"><div className="relative flex-1"><Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input value={query} onChange={(e) => onQuery(e.target.value)} className="h-10 rounded-card border-transparent bg-searchBackground pl-12 pr-11" aria-label="搜尋" />{query && <button type="button" onClick={() => onQuery("")} aria-label="清除搜尋" className="absolute right-5 top-1/2 -translate-y-1/2 text-muted"><X className="h-4 w-4" /></button>}</div><Select value={sort} onValueChange={(value) => onSort(value as TravelItemSort)}><SelectTrigger className="w-[118px] rounded-pill"><ArrowUpDown className="h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="date">日期</SelectItem><SelectItem value="category">分類</SelectItem><SelectItem value="area">地點</SelectItem></SelectContent></Select></div>{visible.length === 0 ? <EmptyState title={`尚無${type === "place" ? "地點" : "美食"}`} description="" icon="map" /> : <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{visible.map((item) => <ItemCard key={item.id} item={item} canEdit={canEdit} listLayout onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />)}</div>}</>;
}

function ItemCard({ item, canEdit, onEdit, onDelete, controls, compactBusiness = false, listLayout = false }: { item: TravelItem; canEdit: boolean; onEdit: () => void; onDelete: () => void; controls?: React.ReactNode; compactBusiness?: boolean; listLayout?: boolean }) {
  if (listLayout) {
    const locationCategory = [item.area, item.category].filter(Boolean).join(" ｜ ");
    return (
      <article className="flex min-w-0 flex-col self-start rounded-card border border-border bg-surface px-6 pt-6 shadow-soft sm:h-[304px] sm:self-stretch">
        <header className={`min-w-0 ${CARD_SECTION_SPACING}`}>
          {item.googleMapsUrl
            ? <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Google Maps 開啟${item.name}`} title="開啟 Google Maps" className="line-clamp-2 min-h-[2.625rem] font-medium hover:text-accent-coffee">{item.name}</a>
            : <p className="line-clamp-2 min-h-[2.625rem] font-medium">{item.name}</p>}
          <div className="mt-2 flex min-h-5 min-w-0 items-center justify-between gap-3 text-xs text-muted">
            <p className="min-w-0 truncate">{locationCategory}</p>
            {item.date && <time dateTime={item.date} className="shrink-0 whitespace-nowrap">{displayDate(item.date)}</time>}
          </div>
        </header>

        <div className={`border-t border-divider ${CARD_SECTION_SPACING}`} />

        <section className="flex min-w-0 flex-col justify-start gap-3 pb-6 sm:h-[102px] sm:overflow-hidden sm:pb-0">
          <BusinessHours item={item} compact={false} flush />
          {item.note && <ClampedNote note={item.note} lines={item.businessHours ? 2 : 4} />}
        </section>

        <footer className="mt-auto flex h-14 shrink-0 items-center border-t border-divider pr-1">
          {(item.extraLink1 || item.extraLink2) && (
            <div className="flex items-center gap-4">
              {item.extraLink1 && <ExternalLinkAction href={item.extraLink1} index={1} />}
              {item.extraLink2 && <ExternalLinkAction href={item.extraLink2} index={2} />}
            </div>
          )}
          <div className="ml-auto flex items-center gap-4">
            {item.googleMapsUrl && <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="開啟 Google Maps" title="開啟 Google Maps" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink sm:h-9 sm:w-9"><Navigation className="h-[18px] w-[18px]" /></a>}
            {canEdit && <><Action label="編輯" smallIcon onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon onClick={onDelete}><Trash2 /></Action></>}
          </div>
        </footer>
      </article>
    );
  }
  return <article className="rounded-card border border-border bg-surface p-6 shadow-soft"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><ItemName item={item} /><p className="mt-2 text-xs text-muted">{item.date ? displayDate(item.date) : "未定"} · {item.category || (item.type === "place" ? "地點" : "美食")}</p></div>{canEdit && <div className="flex shrink-0">{controls}<Action label="編輯" onClick={onEdit}><SquarePen /></Action><Action label="刪除" onClick={onDelete}><Trash2 /></Action></div>}</div><div className="my-4 border-t border-divider" />{item.area && <p className="text-sm text-muted">{item.area}</p>}<BusinessHours item={item} compact={compactBusiness} />{item.note && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{item.note}</p>}</article>;
}

function Daily({ trip, items, canEdit, onAdd, onEdit, onDelete, onReorder }: { trip: Trip; items: TravelItem[]; canEdit: boolean; onAdd: (date: string) => void; onEdit: (item: TravelItem) => void; onDelete: (item: TravelItem) => void; onReorder: (activeId: string, overId: string) => void }) {
  const dates = tripDates(trip);
  const [activeDate, setActiveDate] = useState(trip.startDate);
  useEffect(() => setActiveDate(trip.startDate), [trip.startDate]);
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
  return <><nav aria-label="快速跳轉日期" className="no-scrollbar mb-6 max-w-full overflow-x-auto"><div className="flex min-w-max flex-nowrap items-center gap-5 pr-4">{dates.map((date) => <button key={date} type="button" onClick={() => jumpToDate(date)} aria-current={activeDate === date ? "date" : undefined} className={`shrink-0 border-b pb-1 text-xs transition-colors ${activeDate === date ? "border-muted text-ink" : "border-transparent text-muted hover:text-ink"}`}>{displayDate(date)}</button>)}</div></nav><div className="space-y-8">{dates.map((date) => { const day = items.filter((item) => item.date === date).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)); return <section id={`daily-${date}`} className="scroll-mt-36" key={date}><div className="mb-4 flex items-center justify-between"><h2 className="text-title font-semibold">{displayDate(date)}</h2>{canEdit && <AddIconButton label={`新增 ${displayDate(date)} 行程`} onClick={() => onAdd(date)} />}</div>{day.length === 0 ? <EmptyState title="今天尚未安排" description="" /> : canEdit ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={day.map((item) => item.id)} strategy={verticalListSortingStrategy}><div className="space-y-3">{day.map((item) => <SortableDailyCard key={item.id} item={item} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />)}</div></SortableContext></DndContext> : <div className="space-y-3">{day.map((item) => <DailyCard key={item.id} item={item} canEdit={false} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />)}</div>}</section>; })}</div></>;
}

function SortableDailyCard({ item, onEdit, onDelete }: { item: TravelItem; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!isInteractiveTarget(event.target)) listeners?.onMouseDown?.(event);
  };
  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isInteractiveTarget(event.target)) listeners?.onTouchStart?.(event);
  };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} className={`cursor-grab touch-auto active:cursor-grabbing ${isDragging ? "relative z-10 opacity-70" : ""}`}><DailyCard item={item} canEdit onEdit={onEdit} onDelete={onDelete} /></div>;
}

function DailyCard({ item, canEdit, onEdit, onDelete }: { item: TravelItem; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const meta = [item.category, item.area].filter(Boolean).join(" ｜ ");
  return <article className="rounded-card border border-border bg-surface shadow-soft sm:h-[156px]">
    <div className="p-6 sm:hidden">
      <div className="flex min-w-0 items-center gap-4"><TypeMark type={item.type} large /><DailyItemName item={item} /></div>
      {meta && <p className="mt-5 truncate text-sm text-muted">{meta}</p>}
      <div className="my-5 border-t border-divider" />
      <BusinessHours item={item} compact={false} flush />
      {item.note && <div className={item.businessHours ? "mt-3" : ""}><ClampedNote note={item.note} lines={2} /></div>}
      <div className="mt-5 border-t border-divider" />
      <DailyFooter item={item} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />
    </div>
    <div className="hidden h-full grid-cols-[38fr_42fr_20fr] sm:grid">
      <div className="flex min-w-0 flex-col justify-between px-6 py-5">
        <div className="flex min-w-0 items-center gap-4"><TypeMark type={item.type} /><DailyItemName item={item} /></div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"><span className="truncate text-xs text-muted">{meta}</span><BusinessHours item={item} compact flush /></div>
      </div>
      <div className="flex min-w-0 flex-col border-l border-divider px-6 py-5">
        {item.note && <ClampedNote note={item.note} lines={3} />}
        {(item.extraLink1 || item.extraLink2) && <div className="mt-auto flex items-center gap-4">{item.extraLink1 && <ExternalLinkAction href={item.extraLink1} index={1} />}{item.extraLink2 && <ExternalLinkAction href={item.extraLink2} index={2} />}</div>}
      </div>
      <div className="flex items-center justify-end gap-2 border-l border-divider px-4" data-no-dnd><DailyActions item={item} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} /></div>
    </div>
  </article>;
}

function TypeMark({ type, large = false }: { type: TravelItemType; large?: boolean }) {
  return <span className={`flex h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-full text-ink ${large ? "text-title" : "text-sm"} ${type === "food" ? "bg-travelType-food" : "bg-travelType-place"}`}>{type === "food" ? "食" : "景"}</span>;
}

function DailyItemName({ item }: { item: TravelItem }) {
  const className = "line-clamp-2 min-w-0 font-medium";
  return item.googleMapsUrl
    ? <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Google Maps 開啟${item.name}`} title="開啟 Google Maps" className={`${className} hover:text-accent-coffee`}>{item.name}</a>
    : <p className={className}>{item.name}</p>;
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a, button, input, textarea, select"));
}

function ClampedNote({ note, lines }: { note: string; lines: 2 | 3 | 4 }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const measure = () => setIsTruncated(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [note, lines]);

  return <>
    <div className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2 text-sm text-muted">
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center leading-4">✦</span>
      <div className="min-w-0">
        <p ref={textRef} className={`${lines === 2 ? "line-clamp-2" : lines === 3 ? "line-clamp-3" : "line-clamp-4"} min-w-0 whitespace-pre-wrap break-words`}>{note}</p>
        {isTruncated && <button type="button" aria-label="查看完整備註" title="查看完整備註" onMouseDown={stopDrag} onTouchStart={stopDrag} onPointerDown={stopDrag} onClick={() => setOpen(true)} className="block text-xs leading-4 text-muted/90 transition-colors hover:text-muted">+ more</button>}
      </div>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="備註">
        <p className="whitespace-pre-wrap break-words text-sm text-ink">{note}</p>
      </DialogContent>
    </Dialog>
  </>;
}

function DailyFooter({ item, canEdit, onEdit, onDelete }: { item: TravelItem; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  return <footer className="flex h-14 items-center" data-no-dnd><div className="flex items-center gap-4">{item.extraLink1 && <ExternalLinkAction href={item.extraLink1} index={1} />}{item.extraLink2 && <ExternalLinkAction href={item.extraLink2} index={2} />}</div><div className="ml-auto flex items-center gap-4"><DailyActions item={item} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} /></div></footer>;
}

function DailyActions({ item, canEdit, onEdit, onDelete }: { item: TravelItem; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  return <>{item.googleMapsUrl && <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="開啟 Google Maps" title="開啟 Google Maps" onPointerDown={stopDrag} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink sm:h-9 sm:w-9"><Navigation className="h-[18px] w-[18px]" /></a>}{canEdit && <><Action label="編輯" smallIcon onPointerDown={stopDrag} onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon onPointerDown={stopDrag} onClick={onDelete}><Trash2 /></Action></>}</>;
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
  const sections = [...tripDates(trip).map((date) => ({ label: displayDate(date), items: items.filter((item) => item.date === date) })), { label: "未定", items: items.filter((item) => !item.date) }];
  const sortedFlights = [...flights].sort((a, b) => `${a.departureDate}T${a.departureTime}`.localeCompare(`${b.departureDate}T${b.departureTime}`) || a.createdAt.localeCompare(b.createdAt));
  const sortedStays = [...hotelStays].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate) || a.createdAt.localeCompare(b.createdAt));
  const sortedTransportations = [...transportations].sort((a, b) => `${a.startDate}T${a.startTime}`.localeCompare(`${b.startDate}T${b.startTime}`) || a.createdAt.localeCompare(b.createdAt));
  const navigation = [{ value: "flight", label: "機票" }, { value: "hotel", label: "住宿" }, { value: "transportation", label: "交通" }, { value: "itinerary", label: "行程" }];
  const jumpToSection = (section: string) => {
    setActiveSection(section);
    document.getElementById(`outline-${section}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  return <>
    <nav aria-label="大綱快速導覽" className="no-scrollbar mb-6 max-w-full overflow-x-auto"><div className="flex min-w-max flex-nowrap items-center gap-5 pr-4">{navigation.map(({ value, label }) => <button key={value} type="button" onClick={() => jumpToSection(value)} aria-current={activeSection === value ? "location" : undefined} className={`shrink-0 border-b pb-1 text-xs transition-colors ${activeSection === value ? "border-muted text-ink" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>)}</div></nav>
    <div className="space-y-12">
      <OutlineDetailsSection id="outline-flight" icon={Plane} label="機票" addLabel="新增機票" canEdit={canEdit} onAdd={() => setFlightDialog({ open: true })}>
        {sortedFlights.length > 0 && <div className="grid grid-cols-1 gap-6 md:grid-cols-2">{sortedFlights.map((flight) => <FlightCard key={flight.id} flight={flight} canEdit={canEdit} onEdit={() => setFlightDialog({ open: true, flight })} onDelete={() => setDeleting({ kind: "flight", value: flight })} />)}</div>}
      </OutlineDetailsSection>
      <OutlineDetailsSection id="outline-hotel" icon={Hotel} label="住宿" addLabel="新增飯店" canEdit={canEdit} onAdd={() => setHotelDialog({ open: true })}>
        {sortedStays.length > 0 && <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{sortedStays.map((stay) => <HotelStayCard key={stay.id} stay={stay} canEdit={canEdit} onEdit={() => setHotelDialog({ open: true, stay })} onDelete={() => setDeleting({ kind: "hotel", value: stay })} />)}</div>}
      </OutlineDetailsSection>
      <OutlineDetailsSection id="outline-transportation" icon={CarFront} label="交通" addLabel="新增交通" canEdit={canEdit} onAdd={() => setTransportationDialog({ open: true })}>
        {sortedTransportations.length > 0 && <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{sortedTransportations.map((transportation) => <TransportationCard key={transportation.id} transportation={transportation} canEdit={canEdit} onEdit={() => setTransportationDialog({ open: true, transportation })} onDelete={() => setDeleting({ kind: "transportation", value: transportation })} />)}</div>}
      </OutlineDetailsSection>
      <section id="outline-itinerary" className="scroll-mt-36"><header className="mb-6 flex items-center"><CalendarDays className="h-5 w-5 text-muted" /><h2 className="ml-3 text-sm font-semibold tracking-body">行程</h2></header><div className="space-y-8">{sections.filter((section) => section.items.length > 0).map((section) => <section key={section.label}><h3 className="mb-4 text-[22px] font-semibold">{section.label}</h3><div className="rounded-card border border-border bg-surface px-6 shadow-soft">{section.items.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)).map((item, index) => <div key={item.id} className={`flex items-center gap-3 py-4 ${index ? "border-t border-divider" : ""}`}>{item.type === "place" ? <MapPin className="h-5 w-5 text-muted" /> : <UtensilsCrossed className="h-5 w-5 text-muted" />}<ItemName item={item} /></div>)}</div></section>)}</div></section>
    </div>
    <FlightDialog open={flightDialog.open} flight={flightDialog.flight} onOpenChange={(open) => setFlightDialog((current) => ({ ...current, open }))} onSave={(value) => { travelRepository.saveFlight({ ...value, id: flightDialog.flight?.id, tripId: trip.id }).then(() => refresh()).then(() => { setFlightDialog({ open: false }); toast.success(flightDialog.flight ? "已更新機票" : "已新增機票"); }).catch((error) => toast.error(errorMessage(error, "機票儲存失敗"))); }} />
    <HotelStayDialog open={hotelDialog.open} stay={hotelDialog.stay} onOpenChange={(open) => setHotelDialog((current) => ({ ...current, open }))} onSave={(value) => { travelRepository.saveHotelStay({ ...value, id: hotelDialog.stay?.id, tripId: trip.id }).then(() => refresh()).then(() => { setHotelDialog({ open: false }); toast.success(hotelDialog.stay ? "已更新飯店" : "已新增飯店"); }).catch((error) => toast.error(errorMessage(error, "飯店儲存失敗"))); }} />
    <TransportationDialog open={transportationDialog.open} transportation={transportationDialog.transportation} onOpenChange={(open) => setTransportationDialog((current) => ({ ...current, open }))} onSave={(value) => { travelRepository.saveTransportation({ ...value, id: transportationDialog.transportation?.id, tripId: trip.id }).then(() => refresh()).then(() => { setTransportationDialog({ open: false }); toast.success(transportationDialog.transportation ? "已更新交通" : "已新增交通"); }).catch((error) => toast.error(errorMessage(error, "交通儲存失敗"))); }} />
    <ConfirmDialog open={Boolean(deleting)} title={`刪除${deleting?.kind === "flight" ? "機票" : deleting?.kind === "hotel" ? "飯店" : "交通"}`} description={`確定刪除「${deleting ? deleteLabel(deleting) : ""}」？`} onOpenChange={(open) => { if (!open) setDeleting(undefined); }} onConfirm={() => { if (!deleting) return; const action = deleting.kind === "flight" ? travelRepository.deleteFlight(deleting.value.id) : deleting.kind === "hotel" ? travelRepository.deleteHotelStay(deleting.value.id) : travelRepository.deleteTransportation(deleting.value.id); action.then(() => refresh()).then(() => { setDeleting(undefined); toast.success("已刪除"); }).catch((error) => toast.error(errorMessage(error, "刪除失敗"))); }} />
  </>;
}

function OutlineDetailsSection({ id, icon: Icon, label, addLabel, canEdit, onAdd, children }: { id: string; icon: typeof Plane; label: string; addLabel: string; canEdit: boolean; onAdd: () => void; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-36"><header className="mb-4 flex items-center"><Icon className="h-5 w-5 text-muted" /><h2 className="ml-3 text-sm font-semibold tracking-body">{label}</h2>{canEdit && <AddIconButton label={addLabel} onClick={onAdd} className="ml-auto" />}</header>{children}</section>;
}

function FlightCard({ flight, canEdit, onEdit, onDelete }: { flight: Flight; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const crossesDate = flight.departureDate !== flight.arrivalDate;
  return <article className="flex min-w-0 flex-col rounded-card border border-border bg-surface px-6 pt-6 shadow-soft">
    <header className="flex min-w-0 items-center justify-between gap-4 pb-5"><div className="flex min-w-0 items-center gap-4"><span className="truncate font-medium">{flight.airline}</span><span className="shrink-0 text-sm text-muted">{flight.flightNumber}</span></div><div className="flex min-w-0 shrink-0 items-center gap-2 text-sm text-muted"><span className="max-w-20 truncate sm:max-w-none">{flight.departurePlace}</span><ChevronRight className="h-4 w-4 shrink-0" /><span className="max-w-20 truncate sm:max-w-none">{flight.arrivalPlace}</span></div></header>
    <div className="border-t border-divider" />
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 py-6"><div className="shrink-0 text-sm text-muted"><time dateTime={flight.departureDate}>{displayDate(flight.departureDate)}</time>{crossesDate && <><span className="mx-2">–</span><time dateTime={flight.arrivalDate}>{displayDate(flight.arrivalDate)}</time></>}</div><div className="flex items-center gap-3 text-title font-medium"><time dateTime={flight.departureTime}>{flight.departureTime}</time><ChevronRight className="h-5 w-5 text-muted" /><time dateTime={flight.arrivalTime}>{flight.arrivalTime}</time></div></div>
    {flight.note && <div className="pb-5"><ClampedNote note={flight.note} lines={2} /></div>}
    <footer className="mt-auto flex h-14 items-center border-t border-divider"><div>{flight.link && <ExternalLinkAction href={flight.link} index={1} />}</div>{canEdit && <div className="ml-auto flex items-center gap-4"><Action label="編輯" smallIcon onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon onClick={onDelete}><Trash2 /></Action></div>}</footer>
  </article>;
}

function HotelStayCard({ stay, canEdit, onEdit, onDelete }: { stay: HotelStay; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const hasTimes = stay.checkInTime || stay.checkOutTime;
  return <article className="flex min-w-0 flex-col rounded-card border border-border bg-surface px-6 pt-6 shadow-soft">
    <h3 className="line-clamp-2 font-medium">{stay.name}</h3>
    <div className="mt-5 border-t border-divider" />
    <div className="space-y-4 py-6"><p className="text-center font-medium"><time dateTime={stay.checkInDate}>{displayDate(stay.checkInDate)}</time><span className="mx-3 text-muted">–</span><time dateTime={stay.checkOutDate}>{displayDate(stay.checkOutDate)}</time></p>
      {hasTimes && <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 rounded-pill bg-searchBackground px-4 py-2 text-sm text-muted">{stay.checkInTime && <span>入住&nbsp; {stay.checkInTime}</span>}{stay.checkOutTime && <span>退房&nbsp; {stay.checkOutTime}</span>}</div>}
      {stay.address && <ContactRow label="地址" value={stay.address} />}{stay.phone && <ContactRow label="電話" value={stay.phone} />}{stay.note && <ClampedNote note={stay.note} lines={2} />}
    </div>
    <footer className="mt-auto flex h-14 items-center border-t border-divider"><div className="flex items-center gap-4">{stay.link && <ExternalLinkAction href={stay.link} index={1} />}{stay.googleMapsUrl && <a href={stay.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="開啟 Google Maps" title="開啟 Google Maps" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink sm:h-9 sm:w-9"><Navigation className="h-[18px] w-[18px]" /></a>}</div>{canEdit && <div className="ml-auto flex items-center gap-4"><Action label="編輯" smallIcon onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon onClick={onDelete}><Trash2 /></Action></div>}</footer>
  </article>;
}

function TransportationCard({ transportation, canEdit, onEdit, onDelete }: { transportation: Transportation; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const isRental = transportation.type === "rental_car";
  const title = isRental ? transportation.company : transportation.routeName;
  const secondary = isRental ? transportation.vehicleModel : transportation.trainNumber;
  const crossesDate = transportation.startDate !== transportation.endDate;
  const details = (isRental
    ? [["地址", transportation.address], ["費用", transportation.cost]]
    : [["座位", transportation.seat], ["車廂", transportation.carriage], ["車票", transportation.ticket], ["費用", transportation.cost]])
    .filter((detail): detail is [string, string] => Boolean(detail[1]));
  return <article className="flex min-w-0 flex-col rounded-card border border-border bg-surface px-6 pt-6 shadow-soft">
    <header className="flex min-w-0 items-center justify-between gap-4 pb-5"><div className="flex min-w-0 items-center gap-4"><h3 className="min-w-0 truncate font-medium">{title}</h3>{secondary && <span className="min-w-0 truncate text-sm text-muted">{secondary}</span>}</div>{transportation.reservationNumber && <span className="max-w-24 shrink-0 truncate text-sm text-muted sm:max-w-40">{transportation.reservationNumber}</span>}</header>
    <div className="border-t border-divider" />
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 py-6"><div className="shrink-0 text-sm text-muted"><time dateTime={transportation.startDate}>{displayDate(transportation.startDate)}</time></div><div className="flex items-center gap-3 text-title font-medium"><time dateTime={transportation.startTime}>{transportation.startTime}</time><ChevronRight className="h-5 w-5 text-muted" />{crossesDate && <time dateTime={transportation.endDate} className="text-sm font-normal text-muted">{displayDate(transportation.endDate)}</time>}<time dateTime={transportation.endTime}>{transportation.endTime}</time></div></div>
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-pill bg-searchBackground px-4 py-2 text-sm text-muted"><span className="min-w-0 truncate">{transportation.departurePlace}</span><span className="min-w-0 truncate text-right">{transportation.arrivalPlace}</span></div>
    <div className="space-y-4 py-6">{details.map(([label, value]) => <ContactRow key={label} label={label} value={value} />)}{transportation.note && <ClampedNote note={transportation.note} lines={2} />}</div>
    <footer className="mt-auto flex h-14 items-center border-t border-divider"><div className="flex items-center gap-4">{transportation.link && <ExternalLinkAction href={transportation.link} index={1} />}{isRental && transportation.googleMapsUrl && <a href={transportation.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label="開啟取車地點 Google Maps" title="開啟取車地點 Google Maps" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink sm:h-9 sm:w-9"><Navigation className="h-[18px] w-[18px]" /></a>}</div>{canEdit && <div className="ml-auto flex items-center gap-4"><Action label="編輯" smallIcon onClick={onEdit}><SquarePen /></Action><Action label="刪除" smallIcon onClick={onDelete}><Trash2 /></Action></div>}</footer>
  </article>;
}

function deleteLabel(deleting: { kind: "flight"; value: Flight } | { kind: "hotel"; value: HotelStay } | { kind: "transportation"; value: Transportation }) {
  if (deleting.kind === "flight") return `${deleting.value.airline} ${deleting.value.flightNumber}`;
  if (deleting.kind === "hotel") return deleting.value.name;
  return deleting.value.type === "rental_car" ? `${deleting.value.company} ${deleting.value.vehicleModel}` : deleting.value.routeName;
}

function ContactRow({ label, value }: { label: string; value: string }) {
  return <div className="grid min-w-0 grid-cols-[42px_minmax(0,1fr)] gap-3 text-sm"><span className="font-medium tracking-body">{label}</span><p className="break-words border-l border-divider pl-3 text-muted">{value}</p></div>;
}

function ItemName({ item }: { item: TravelItem }) { return item.googleMapsUrl ? <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-medium hover:text-accent-coffee"><span>{item.name}</span><MapPinned className="h-5 w-5 shrink-0" /></a> : <p className="font-medium">{item.name}</p>; }
function BusinessHours({ item, compact, flush = false }: { item: TravelItem; compact: boolean; flush?: boolean }) {
  if (!item.businessHours) return null;
  const status = getBusinessStatus(item.businessHours);
  return <div className={`flex min-w-0 flex-wrap items-center gap-2 text-muted ${compact ? "mt-2 text-xs" : `${flush ? "" : "mt-3"} text-sm`}`}><Clock3 className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{item.businessHours}</span>{status && <BusinessStatusLabel status={status} />}</div>;
}
function BusinessStatusLabel({ status }: { status: BusinessStatus }) {
  const values = {
    open: { label: "營業中", className: "border-tag-drink bg-tag-drink text-tag-drink-fg" },
    "closing-soon": { label: "即將打烊", className: "border-tag-expiring bg-tag-expiring text-tag-expiring-fg" },
    closed: { label: "已打烊", className: "border-tag-other bg-tag-other text-tag-other-fg" },
  } as const;
  const value = values[status];
  return <span className={`rounded-lg border px-2 py-0.5 text-[11px] leading-4 ${value.className}`}>{value.label}</span>;
}
function ExternalLinkAction({ href, index }: { href: string; index: 1 | 2 }) {
  const label = `開啟其他連結 ${index}`;
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} onPointerDown={stopDrag} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink sm:h-9 sm:w-9"><Link2 className="h-[18px] w-[18px]" /></a>;
}
function Action({ label, onClick, onPointerDown, children, disabled, smallIcon = false }: { label: string; onClick: () => void; onPointerDown?: React.PointerEventHandler<HTMLButtonElement>; children: React.ReactElement; disabled?: boolean; smallIcon?: boolean }) { return <button type="button" aria-label={label} title={label} disabled={disabled} onPointerDown={onPointerDown} onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink disabled:opacity-30 sm:h-9 sm:w-9"><span className={smallIcon ? "[&>svg]:h-[18px] [&>svg]:w-[18px]" : "[&>svg]:h-5 [&>svg]:w-5"}>{children}</span></button>; }

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
