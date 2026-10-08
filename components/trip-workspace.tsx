"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpDown, CalendarDays, CarFront, ChevronRight, Clock3, Copy, Ellipsis, FolderHeart, Hotel, Link2, MapPin, MapPinned, MapPinPlus, Navigation, Plane, Search, SquarePen, Trash2, UtensilsCrossed, X } from "lucide-react";
import { closestCenter, DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { AuthControl } from "@/components/auth-control";
import { AddIconButton } from "@/components/add-icon-button";
import { AddCollectionItemToTripDialog } from "@/components/add-collection-item-to-trip-dialog";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ClampedNote } from "@/components/clamped-note";
import { FlightDialog } from "@/components/flight-dialog";
import { HotelStayDialog } from "@/components/hotel-stay-dialog";
import { isDailyCardInteractiveTarget, MobileDailySwipeActions, MobileSwipeActions, useMobileSwipeGroup } from "@/components/mobile-daily-swipe-actions";
import { TransportationDialog } from "@/components/transportation-dialog";
import { TravelItemDialog } from "@/components/travel-item-dialog";
import { TravelItemImportAction, TravelItemImportDialog } from "@/components/travel-item-import-dialog";
import { StandaloneRefreshAction } from "@/components/standalone-refresh-action";
import { TripPrimaryNav, type TripPrimaryTab } from "@/components/trip-primary-nav";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayDate, tripDates } from "@/lib/travel-dates";
import { getBusinessStatus, type BusinessStatus } from "@/lib/business-hours";
import { useAuth } from "@/lib/auth-context";
import { travelRepository } from "@/lib/travel-repository";
import type { CollectionItemStatus, Flight, HotelStay, Transportation, TravelItem, TravelItemSort, TravelItemType, Trip, TripRole } from "@/lib/types";

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
  const [tab, setTab] = useState<Tab>(initialTrip?.mode === "collection" ? "food" : "daily");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TravelItemSort>(initialTrip?.mode === "collection" ? "area" : "date");
  const [dialog, setDialog] = useState<{ open: boolean; type: TravelItemType; item?: TravelItem; initialDate?: string; allowTypeChange?: boolean; desktopTwoColumn?: boolean }>({ open: false, type: "place" });
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<TravelItem>();
  const [addingToTrip, setAddingToTrip] = useState<TravelItem>();
  const [editableTrips, setEditableTrips] = useState<Trip[]>([]);
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
      setEditableTrips([]);
      return;
    }
    travelRepository.getTripRole(tripId).then(setRole).catch((error) => toast.error(errorMessage(error, "無法確認編輯權限")));
    if (trip?.mode === "collection") {
      travelRepository.getEditableTrips().then(setEditableTrips).catch((error) => toast.error(errorMessage(error, "無法載入可加入的旅程")));
    } else {
      setEditableTrips([]);
    }
  }, [authReady, trip?.mode, tripId, user]);
  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab === "daily" || requestedTab === "place" || requestedTab === "food" || requestedTab === "outline") {
      setTab(initialTrip?.mode === "collection" && requestedTab === "daily" ? "food" : requestedTab);
    }
  }, [initialTrip?.mode]);
  const edit = (item: TravelItem) => setDialog({ open: true, type: item.type, item });
  const editListItem = (item: TravelItem) => setDialog({ open: true, type: item.type, item, desktopTwoColumn: true });
  const remove = (item: TravelItem) => setDeleting(item);
  const duplicate = async (item: TravelItem) => {
    try {
      await travelRepository.duplicateItem(item.id);
      await refresh();
      toast.success(`已複製${item.type === "food" ? "美食" : "地點"}`);
    } catch (error) {
      toast.error(errorMessage(error, "複製失敗"));
    }
  };
  const canEdit = isAdmin || Boolean(role);
  const toggleCollectionStatus = async (item: TravelItem) => {
    if (!item.status) return;
    const nextStatus: CollectionItemStatus = item.status === "completed" ? "planned" : "completed";
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, status: nextStatus } : value));
    try {
      const saved = await travelRepository.updateItemStatus(item.id, nextStatus);
      setItems((current) => current.map((value) => value.id === saved.id ? saved : value));
    } catch (error) {
      setItems((current) => current.map((value) => value.id === item.id ? item : value));
      toast.error(errorMessage(error, "狀態更新失敗"));
    }
  };

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
        <div className="hidden shrink-0 items-center gap-3 sm:flex"><TripPrimaryNav activeTab={tab} onTabChange={setTab} collection={trip.mode === "collection"} /><div className="flex shrink-0 items-center justify-end gap-1 before:mr-2 before:h-[30px] before:w-px before:shrink-0 before:bg-border before:content-['']"><StandaloneRefreshAction className="border-0 bg-transparent shadow-none hover:bg-transparent" />{canEdit && <TravelItemImportAction onClick={() => setImportOpen(true)} className="border-0 bg-transparent shadow-none hover:bg-transparent hover:text-ink" />}<Link href={`/trip/${tripId}/resources`} aria-label="旅途資訊" title="旅途資訊" className="flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent text-muted shadow-none hover:bg-transparent hover:text-ink"><FolderHeart className="h-4 w-4 stroke-[1.5]" /></Link><AuthControl className="border-0 bg-transparent text-muted shadow-none hover:bg-transparent hover:text-ink [&>svg]:h-4 [&>svg]:w-4" /></div></div>
        <div className="flex shrink-0 items-center justify-end gap-2 sm:hidden"><StandaloneRefreshAction />{canEdit && <TravelItemImportAction onClick={() => setImportOpen(true)} />}<Link href={`/trip/${tripId}/resources`} aria-label="旅途資訊" title="旅途資訊" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-searchBackground hover:text-[#555555]"><FolderHeart className="h-4 w-4 stroke-[1.5]" /></Link><AuthControl /></div>
      </header>
      <div className="sm:hidden"><TripPrimaryNav activeTab={tab} onTabChange={setTab} collection={trip.mode === "collection"} /></div>
      {trip.mode === "trip" && tab === "daily" && <Daily trip={trip} items={items} canEdit={canEdit} onAdd={(date) => setDialog({ open: true, type: "place", initialDate: date, allowTypeChange: true })} onEdit={edit} onDelete={remove} onReorder={reorder} />}
      {(tab === "place" || tab === "food") && <ItemList type={tab} items={items} query={query} sort={sort} collection={trip.mode === "collection"} canEdit={canEdit} canAddToTrip={trip.mode === "collection" && canEdit && editableTrips.length > 0} onQuery={setQuery} onSort={setSort} onAdd={() => setDialog({ open: true, type: tab, desktopTwoColumn: true })} onEdit={editListItem} onAddToTrip={setAddingToTrip} onDuplicate={duplicate} onDelete={remove} onToggleStatus={toggleCollectionStatus} />}
      {tab === "outline" && (trip.mode === "collection" ? <CollectionOutline items={items} /> : <Outline trip={trip} items={items} canEdit={canEdit} initialFlights={initialFlights} initialHotelStays={initialHotelStays} initialTransportations={initialTransportations} />)}
      {canEdit && <TravelItemImportDialog open={importOpen} trip={trip} onOpenChange={setImportOpen} onImported={refresh} />}
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
      <AddCollectionItemToTripDialog
        open={Boolean(addingToTrip)}
        item={addingToTrip}
        trips={editableTrips}
        onOpenChange={(open) => { if (!open) setAddingToTrip(undefined); }}
        onConfirm={async (targetTripId, date) => {
          if (!addingToTrip) return;
          try {
            await travelRepository.addCollectionItemToTrip(addingToTrip, targetTripId, date);
            setAddingToTrip(undefined);
            toast.success("已加入旅程");
          } catch (error) {
            toast.error(errorMessage(error, "加入旅程失敗"));
          }
        }}
      />
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

function ItemList({ type, items, query, sort, collection, canEdit, canAddToTrip, onQuery, onSort, onAdd, onEdit, onAddToTrip, onDuplicate, onDelete, onToggleStatus }: { type: TravelItemType; items: TravelItem[]; query: string; sort: TravelItemSort; collection: boolean; canEdit: boolean; canAddToTrip: boolean; onQuery: (value: string) => void; onSort: (value: TravelItemSort) => void; onAdd: () => void; onEdit: (item: TravelItem) => void; onAddToTrip: (item: TravelItem) => void; onDuplicate: (item: TravelItem) => void; onDelete: (item: TravelItem) => void; onToggleStatus: (item: TravelItem) => void }) {
  const [area, setArea] = useState("");
  const [status, setStatus] = useState<CollectionItemStatus | "">("");
  const { openItemId, open: openSwipe, close: closeSwipe } = useMobileSwipeGroup();
  const areas = useMemo(() => [...new Set(items.filter((item) => item.type === type).map((item) => item.area.trim()).filter(Boolean))], [items, type]);
  useEffect(() => { setArea(""); setStatus(""); }, [type]);
  useEffect(() => closeSwipe(), [area, closeSwipe, query, sort, status, type]);
  useEffect(() => {
    if (area && !areas.includes(area)) setArea("");
  }, [area, areas]);
  const visible = useMemo(() => items.filter((item) => item.type === type && (!area || item.area.trim() === area) && (!status || item.status === status) && [item.name, item.category, item.area, item.note, item.experienceNote, item.consumedItems].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => compareItems(a, b, sort)), [area, items, query, sort, status, type]);
  const renderAreaMenu = () => <div className="flex min-w-max flex-nowrap items-center gap-5 pr-4">{["", ...areas].map((value) => <button key={value || "all"} type="button" onClick={() => setArea(value)} aria-pressed={area === value} className={`shrink-0 border-b pb-1 text-xs transition-colors ${area === value ? "border-ink text-ink" : "border-transparent text-muted hover:text-[#555555]"}`}>{value || "全部"}</button>)}</div>;
  const renderStatusMenu = () => collection && <div className="flex h-10 shrink-0 items-stretch overflow-hidden rounded-[5px] border border-border bg-surface sm:h-8">{(["", "planned", "completed"] as const).map((value, index) => <button key={value || "all"} type="button" onClick={() => setStatus(value)} aria-pressed={status === value} className={`min-w-0 whitespace-nowrap px-2 text-[10px] transition-colors sm:px-3 sm:text-xs ${index ? "border-l border-divider" : ""} ${status === value ? "bg-searchBackground text-ink" : "text-muted hover:text-[#555555]"}`}>{value === "" ? "全部" : value === "planned" ? (type === "place" ? "想去" : "想吃") : (type === "place" ? "去過" : "吃過")}</button>)}</div>;
  const statusLabel = (value: CollectionItemStatus | "") => value === "" ? "全部" : value === "planned" ? (type === "place" ? "想去" : "想吃") : (type === "place" ? "去過" : "吃過");
  const renderMobileStatus = () => collection && <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" ? "" : value as CollectionItemStatus)}><SelectTrigger aria-label="狀態篩選" className="h-10 w-auto min-w-[64px] shrink-0 flex-nowrap whitespace-nowrap rounded-none border-0 bg-transparent px-2 text-[11px] shadow-none focus:ring-0 [&>svg]:shrink-0 [&>span]:whitespace-nowrap"><SelectValue /></SelectTrigger><SelectContent>{(["", "planned", "completed"] as const).map((value) => <SelectItem key={value || "all"} value={value || "all"}>{statusLabel(value)}</SelectItem>)}</SelectContent></Select>;
  const renderSearch = (desktop = false) => <div className="relative min-w-[72px] flex-1 sm:w-[290px] sm:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-muted sm:left-4" /><Input value={query} onChange={(e) => onQuery(e.target.value)} className={`bg-surface pl-9 pr-8 sm:pl-11 sm:pr-10 ${desktop ? "h-8" : ""}`} aria-label="搜尋" /><button type="button" onClick={() => onQuery("")} aria-label="清除搜尋" aria-hidden={!query} tabIndex={query ? 0 : -1} disabled={!query} className={`absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-card text-muted transition-[color,opacity] hover:bg-searchBackground hover:text-[#555555] sm:right-3 ${query ? "visible opacity-100" : "invisible pointer-events-none opacity-0"}`}><X className="h-4 w-4 stroke-[1.5]" /></button></div>;
  const renderSort = (desktop = false, unified = false) => <Select value={sort} onValueChange={(value) => onSort(value as TravelItemSort)}><SelectTrigger aria-label="排序" className={`${desktop ? "h-8 min-w-[112px] w-auto" : unified ? "h-10 w-[88px] rounded-none border-0 bg-transparent text-[11px] shadow-none focus:ring-0" : "h-10 w-[88px] text-[11px]"} shrink-0 flex-nowrap whitespace-nowrap px-2 sm:px-3 [&>svg]:shrink-0 [&>span]:whitespace-nowrap`}><ArrowUpDown className="h-4 w-4 shrink-0 stroke-[1.5]" /><SelectValue /></SelectTrigger><SelectContent>{!collection && <SelectItem value="date">日期</SelectItem>}<SelectItem value="area">地點</SelectItem><SelectItem value="category">分類</SelectItem>{collection && <><SelectItem value="status">狀態</SelectItem><SelectItem value="rating">評分</SelectItem></>}</SelectContent></Select>;
  const renderAdd = (desktop = false) => canEdit && <AddIconButton label={`新增${type === "place" ? "地點" : "美食"}`} onClick={onAdd} className={`${desktop ? "h-8 w-8" : "h-10 w-10"} shrink-0 bg-transparent hover:bg-transparent`} />;
  return <>
    <div className="pt-5 sm:hidden">
      <div className="mb-5 flex h-10 min-w-0 items-center overflow-hidden rounded-[5px] border border-border bg-surface">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-muted" /><Input value={query} onChange={(event) => onQuery(event.target.value)} className="h-10 min-w-0 rounded-none border-0 bg-transparent pl-9 pr-8 shadow-none focus-visible:ring-0" aria-label="搜尋" /><button type="button" onClick={() => onQuery("")} aria-label="清除搜尋" aria-hidden={!query} tabIndex={query ? 0 : -1} disabled={!query} className={`absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted transition-opacity ${query ? "visible opacity-100" : "invisible pointer-events-none opacity-0"}`}><X className="h-4 w-4 stroke-[1.5]" /></button></div>
        {collection && <div className="shrink-0 border-l border-divider">{renderMobileStatus()}</div>}
        <div className="shrink-0 border-l border-divider">{renderSort(false, true)}</div>
        {canEdit && <div className="flex h-full shrink-0 items-center border-l border-divider">{renderAdd()}</div>}
      </div>
      <nav aria-label={`${type === "place" ? "地點" : "美食"}區域篩選`} className="no-scrollbar mb-8 max-w-full overflow-x-auto">{renderAreaMenu()}</nav>
    </div>
    <div className="mb-8 hidden pt-8 sm:block">
      <div className="mb-5 flex min-w-0 items-center justify-between gap-6"><div>{renderStatusMenu()}</div><div className="ml-auto flex min-w-0 items-center gap-2">{renderSearch(true)}{renderSort(true)}{renderAdd(true)}</div></div>
      <nav aria-label={`${type === "place" ? "地點" : "美食"}區域篩選`} className="no-scrollbar max-w-full overflow-x-auto">{renderAreaMenu()}</nav>
    </div>
    {visible.length === 0 ? <EmptyState title={`尚無${type === "place" ? "地點" : "美食"}`} description="" icon="map" /> : <div className="grid grid-cols-1 gap-6 sm:gap-7 lg:grid-cols-2">{visible.map((item) => <ItemCard key={item.id} item={item} canEdit={canEdit} canAddToTrip={canAddToTrip} collection={collection} listLayout swipeOpen={openItemId === item.id} onSwipeOpen={() => openSwipe(item.id)} onSwipeClose={closeSwipe} onEdit={() => onEdit(item)} onAddToTrip={() => onAddToTrip(item)} onDuplicate={() => onDuplicate(item)} onDelete={() => onDelete(item)} onToggleStatus={() => onToggleStatus(item)} />)}</div>}
  </>;
}

function compareItems(a: TravelItem, b: TravelItem, sort: TravelItemSort) {
  if (sort === "rating") return (b.rating ?? -1) - (a.rating ?? -1) || a.createdAt.localeCompare(b.createdAt);
  const value = sort === "date" ? (a.date ?? "9999-99-99") : (a[sort] ?? "");
  const other = sort === "date" ? (b.date ?? "9999-99-99") : (b[sort] ?? "");
  return value.localeCompare(other, "zh-Hant") || a.createdAt.localeCompare(b.createdAt);
}

function ItemCard({ item, canEdit, canAddToTrip = false, collection = false, onEdit, onAddToTrip = () => undefined, onDuplicate = () => undefined, onDelete, onToggleStatus = () => undefined, controls, compactBusiness = false, listLayout = false, swipeOpen = false, onSwipeOpen = () => undefined, onSwipeClose = () => undefined }: { item: TravelItem; canEdit: boolean; canAddToTrip?: boolean; collection?: boolean; onEdit: () => void; onAddToTrip?: () => void; onDuplicate?: () => void; onDelete: () => void; onToggleStatus?: () => void; controls?: React.ReactNode; compactBusiness?: boolean; listLayout?: boolean; swipeOpen?: boolean; onSwipeOpen?: () => void; onSwipeClose?: () => void }) {
  const imageUrl = useTravelItemImageUrl(listLayout ? item.imagePath : undefined);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobileOverflow, setMobileOverflow] = useState({ note: false, completed: false });
  const [desktopOverflow, setDesktopOverflow] = useState({ note: false, completed: false });
  const reviewVisible = hasReviewInfo(item, collection);
  useEffect(() => {
    if (!item.note) {
      setMobileOverflow((current) => current.note ? { ...current, note: false } : current);
      setDesktopOverflow((current) => current.note ? { ...current, note: false } : current);
    }
    if (!reviewVisible) {
      setMobileOverflow((current) => current.completed ? { ...current, completed: false } : current);
      setDesktopOverflow((current) => current.completed ? { ...current, completed: false } : current);
    }
  }, [item.note, reviewVisible]);
  if (listLayout) {
    const hasMobileMore = mobileOverflow.note || (reviewVisible && mobileOverflow.completed);
    const hasDesktopMore = desktopOverflow.note || (reviewVisible && desktopOverflow.completed);
    const hasMobileFooterActions = Boolean(item.extraLink1 || item.extraLink2 || hasMobileMore);
    return (
      <>
      <MobileSwipeActions itemId={item.id} canAddToTrip={canAddToTrip} canEdit={canEdit} canDuplicate={canEdit} canDelete={canEdit} open={swipeOpen} mobileFrame onOpen={onSwipeOpen} onClose={onSwipeClose} onAddToTrip={onAddToTrip} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete}>
      <article className="flex min-w-0 flex-col self-start bg-surface px-4 pt-4">
        <header className="flex min-w-0 items-center justify-between gap-4 pb-4">
          <div className="min-w-0 flex-1">
          {item.googleMapsUrl
            ? <a href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Google Maps 開啟${item.name}`} title="開啟 Google Maps" className="line-clamp-2 font-medium hover:text-[#555555]">{item.name}</a>
            : <p className="line-clamp-2 font-medium">{item.name}</p>}
          </div>
          <CardMetadata item={item} collection={collection} canEdit={canEdit} onToggleStatus={onToggleStatus} mobile />
        </header>
        {item.imagePath && <TravelItemCardImage item={item} url={imageUrl} mobile />}
        <section className="flex min-w-0 flex-1 flex-col justify-start gap-3 pb-4">
          <ItemCompactBusinessHours item={item} />
          {item.note && <ClampedNote note={item.note} lines={reviewVisible ? 1 : 5} showMarker={false} hideMoreAction onOverflowChange={(overflow) => setMobileOverflow((current) => current.note === overflow ? current : { ...current, note: overflow })} textClassName={CARD_NOTE_TYPOGRAPHY} />}
          {reviewVisible && <ReviewInfo item={item} collection={collection} onOverflowChange={(overflow) => setMobileOverflow((current) => current.completed === overflow ? current : { ...current, completed: overflow })} />}
        </section>
        {hasMobileFooterActions && <footer className="mt-auto flex min-h-12 shrink-0 items-center border-t border-divider">
          <div className="flex items-center gap-4">
            {hasMobileMore && <MoreDetailsAction onClick={() => setDetailsOpen(true)} />}
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
          {(item.area || item.category || item.date || collection) && <CardMetadata item={item} collection={collection} canEdit={canEdit} onToggleStatus={onToggleStatus} />}
        </header>
        <div className="flex min-w-0 flex-1 gap-4 pb-5">
          <section className="flex min-w-0 flex-1 flex-col gap-3">
            <ItemCompactBusinessHours item={item} />
            {item.note && <ClampedNote note={item.note} lines={reviewVisible ? 1 : 5} showMarker={false} hideMoreAction onOverflowChange={(overflow) => setDesktopOverflow((current) => current.note === overflow ? current : { ...current, note: overflow })} textClassName={CARD_NOTE_TYPOGRAPHY} />}
            {reviewVisible && <ReviewInfo item={item} collection={collection} onOverflowChange={(overflow) => setDesktopOverflow((current) => current.completed === overflow ? current : { ...current, completed: overflow })} />}
          </section>
          {item.imagePath && <TravelItemCardImage item={item} url={imageUrl} />}
        </div>
        <footer className="mt-auto flex min-h-12 shrink-0 items-center border-t border-divider/60">
          <div className="flex items-center gap-4">
            {hasDesktopMore && <MoreDetailsAction onClick={() => setDetailsOpen(true)} quiet />}
            {item.extraLink1 && <ExternalLinkAction href={item.extraLink1} index={1} quiet />}
            {item.extraLink2 && <ExternalLinkAction href={item.extraLink2} index={2} quiet />}
          </div>
          {canEdit && <div className="ml-auto flex items-center gap-4">{canAddToTrip && <Action label="加入旅程" quiet onClick={onAddToTrip}><MapPinPlus /></Action>}<Action label="編輯" quiet onClick={onEdit}><SquarePen /></Action><Action label="複製" quiet onClick={onDuplicate}><Copy /></Action><Action label="刪除" quiet onClick={onDelete}><Trash2 /></Action></div>}
        </footer>
      </article>
      <ItemDetailsDialog item={item} open={detailsOpen} onOpenChange={setDetailsOpen} />
      </>
    );
  }
  return <article className="rounded-card border border-border bg-surface p-6 shadow-soft"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><ItemName item={item} /><p className="mt-2 text-xs text-muted">{item.date ? displayDate(item.date) : "未定"} · {item.category || (item.type === "place" ? "地點" : "美食")}</p></div>{canEdit && <div className="flex shrink-0">{controls}<Action label="編輯" onClick={onEdit}><SquarePen /></Action><Action label="刪除" onClick={onDelete}><Trash2 /></Action></div>}</div><div className="my-4 border-t border-divider" />{item.area && <p className="text-sm text-muted">{item.area}</p>}<BusinessHours item={item} compact={compactBusiness} />{item.note && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{item.note}</p>}</article>;
}

function CardMetadata({ item, collection, canEdit, onToggleStatus, mobile = false }: { item: TravelItem; collection: boolean; canEdit: boolean; onToggleStatus: () => void; mobile?: boolean }) {
  const values = [item.area, item.category].filter(Boolean);
  const separator = <span aria-hidden="true">｜</span>;
  return <div className={`flex max-w-[62%] shrink-0 items-center gap-2 text-xs font-normal leading-4 ${mobile ? "text-ink" : "text-muted"}`}>
    {values.map((value, index) => <span key={`${value}-${index}`} className="contents">{index > 0 && separator}<span className="min-w-0 truncate">{value}</span></span>)}
    {collection && <>{values.length > 0 && separator}<CollectionStatus item={item} canEdit={canEdit} onToggle={onToggleStatus} /></>}
    {!collection && item.date && <>{values.length > 0 && separator}<time dateTime={item.date} className="whitespace-nowrap">{mobile ? displayDate(item.date) : <DailyDateLabel date={item.date} />}</time></>}
  </div>;
}

function CollectionStatus({ item, canEdit, onToggle }: { item: TravelItem; canEdit: boolean; onToggle: () => void }) {
  const label = `${item.status === "completed" ? "✓" : "☐"} ${collectionStatusLabel(item)}`;
  if (!canEdit) return <span className="whitespace-nowrap">{label}</span>;
  return <button type="button" aria-label={`切換為${item.status === "completed" ? (item.type === "place" ? "想去" : "想吃") : (item.type === "place" ? "去過" : "吃過")}`} className="-m-2 whitespace-nowrap p-2 transition-colors hover:text-ink" onPointerDown={stopDrag} onClick={(event) => { event.stopPropagation(); onToggle(); }}>{label}</button>;
}

function ReviewInfo({ item, collection, onOverflowChange }: { item: TravelItem; collection: boolean; onOverflowChange: (overflow: boolean) => void }) {
  const hasScore = item.rating !== null;
  const hasDetails = Boolean(item.consumedItems || item.experienceNote);
  useEffect(() => {
    if (!hasDetails) onOverflowChange(false);
  }, [hasDetails, onOverflowChange]);
  return <div className={`flex min-w-0 items-stretch bg-[#f9f9f9] p-3 ${hasScore && hasDetails ? "gap-3" : ""}`} style={{ borderRadius: 5 }}>
    {hasScore && <div className="flex min-w-14 shrink-0 items-center justify-center px-2 text-center"><div className="flex flex-col items-center justify-center gap-0.5"><span className="text-2xl font-medium text-ink">{formatRating(item.rating!)}</span>{collection && item.completedDate && <time dateTime={item.completedDate} className="text-[10px] font-normal leading-4 text-muted">{formatCompletedDate(item.completedDate)}</time>}</div></div>}
    {hasScore && hasDetails && <div aria-hidden="true" className="w-px shrink-0 bg-border" />}
    {hasDetails && <CompletedTextPreview item={item} onOverflowChange={onOverflowChange} />}
  </div>;
}

function CompletedTextPreview({ item, onOverflowChange }: { item: TravelItem; onOverflowChange: (overflow: boolean) => void }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const onOverflowChangeRef = useRef(onOverflowChange);
  onOverflowChangeRef.current = onOverflowChange;
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const measure = () => onOverflowChangeRef.current(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [item.consumedItems, item.experienceNote]);
  return <p ref={textRef} className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap break-words text-xs font-normal leading-[1.65] tracking-body">
    {item.consumedItems && <span className="text-[#333333]">{item.consumedItems}</span>}
    {item.consumedItems && item.experienceNote && "\n"}
    {item.experienceNote && <span className="text-muted">{item.experienceNote}</span>}
  </p>;
}

function MoreDetailsAction({ onClick, quiet = false }: { onClick: () => void; quiet?: boolean }) {
  return <Action label="顯示完整內容" quiet={quiet} onPointerDown={stopDrag} onClick={onClick}><Ellipsis className="stroke-[1.5]" /></Action>;
}

function ItemDetailsDialog({ item, open, onOpenChange }: { item: TravelItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const reviewVisible = item.status !== "planned";
  const sections = [
    { label: "備註", value: item.note, className: "text-muted" },
    { label: "吃了什麼", value: reviewVisible ? item.consumedItems : "", className: "text-[#333333]" },
    { label: "心得", value: reviewVisible ? item.experienceNote : "", className: "text-muted" },
  ].filter((section) => Boolean(section.value));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="完整內容"><div className="divide-y divide-divider">{sections.map((section) => <section key={section.label} className="py-4 first:pt-0 last:pb-0"><h3 className="mb-2 text-xs font-medium text-ink">{section.label}</h3><p className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${section.className}`}>{section.value}</p></section>)}</div></DialogContent></Dialog>;
}

function hasReviewInfo(item: TravelItem, collection: boolean) {
  const hasContent = item.rating !== null || Boolean(item.consumedItems) || Boolean(item.experienceNote);
  return hasContent && (!collection || item.status === "completed");
}

function formatCompletedDate(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${year}/${month}/${day}` : date;
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
  const [activeDate, setActiveDate] = useState(trip.startDate ?? "");
  const [openSwipeItemId, setOpenSwipeItemId] = useState<string>();
  useEffect(() => setActiveDate(trip.startDate ?? ""), [trip.startDate]);
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

function DailyDateLabel({ date }: { date?: string | null }) {
  const formatted = displayDate(date);
  if (!formatted) return null;
  const [month, day] = formatted.split("/");
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

function collectionStatusLabel(item: TravelItem) {
  if (item.status === "completed") return item.type === "place" ? "去過" : "吃過";
  return item.type === "place" ? "想去" : "想吃";
}

function formatRating(rating: number) {
  return Number.isInteger(rating) ? String(rating) : String(Number(rating.toFixed(2)));
}

function CollectionOutline({ items }: { items: TravelItem[] }) {
  const food = items.filter((item) => item.type === "food");
  const places = items.filter((item) => item.type === "place");
  return <div className="space-y-10 pb-24 pt-8">
    <CollectionSummary label="美食" items={food} plannedLabel="想吃" completedLabel="吃過" />
    <CollectionSummary label="地點" items={places} plannedLabel="想去" completedLabel="去過" />
  </div>;
}

function CollectionSummary({ label, items, plannedLabel, completedLabel }: { label: string; items: TravelItem[]; plannedLabel: string; completedLabel: string }) {
  const planned = items.filter((item) => item.status === "planned");
  const completed = items.filter((item) => item.status === "completed");
  return <section>
    <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-title font-semibold">{label}</h2><p className="text-xs text-muted">{label} {items.length}｜{plannedLabel} {planned.length}｜{completedLabel} {completed.length}</p></header>
    <div className="space-y-5">
      <CollectionOutlineGroup label={plannedLabel} items={planned} />
      <CollectionOutlineGroup label={completedLabel} items={completed} completed />
    </div>
  </section>;
}

function CollectionOutlineGroup({ label, items, completed = false }: { label: string; items: TravelItem[]; completed?: boolean }) {
  const groups = [...new Set(items.map((item) => item.area.trim() || "未分類"))].map((area) => ({ area, items: items.filter((item) => (item.area.trim() || "未分類") === area) }));
  const tagClassName = "inline-flex min-h-7 items-center rounded-[5px] bg-searchBackground px-3 py-1 text-[11px] font-normal text-ink";
  return <section className="rounded-card border border-border bg-surface px-5 py-4 shadow-soft"><h3 className="mb-4 text-sm font-semibold">{label}</h3>{groups.length === 0 ? <p className="text-sm text-muted">尚無項目</p> : <div className="space-y-4">{groups.map((group) => <div key={group.area} className="grid grid-cols-[auto_1px_minmax(0,1fr)] items-stretch gap-4"><p className="flex items-center text-xs leading-7 text-ink">{group.area}</p><span aria-hidden="true" className="h-full min-h-7 bg-divider" /><div className="flex min-w-0 flex-wrap content-center gap-2">{group.items.map((item) => {
    const content = <>{item.name}{completed && item.rating !== null ? `｜${formatRating(item.rating)}` : ""}</>;
    return item.googleMapsUrl
      ? <a key={item.id} href={item.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Google Maps 開啟${item.name}`} className={`${tagClassName} transition-colors hover:text-[#555555]`}>{content}</a>
      : <span key={item.id} className={tagClassName}>{content}</span>;
  })}</div></div>)}</div>}</section>;
}

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
