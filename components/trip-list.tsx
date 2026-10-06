"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, MapPin, PlaneTakeoff, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AuthControl } from "@/components/auth-control";
import { AddIconButton } from "@/components/add-icon-button";
import { PendingInvitationsControl } from "@/components/pending-invitations-control";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MobileSwipeActions, useMobileSwipeGroup } from "@/components/mobile-daily-swipe-actions";
import { TripFormDialog } from "@/components/trip-form-dialog";
import { useAuth } from "@/lib/auth-context";
import { travelRepository } from "@/lib/travel-repository";
import type { Trip, TripRole } from "@/lib/types";

const HOME_CARD_SPACING = "py-4";

export function TripList({ initialTrips }: { initialTrips: Trip[] }) {
  const { user, isAdmin, ready: authReady } = useAuth();
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [roles, setRoles] = useState<Map<string, TripRole>>(new Map());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trip>();
  const [deleting, setDeleting] = useState<Trip>();
  const { openItemId, open: openSwipe, close: closeSwipe } = useMobileSwipeGroup();

  const refresh = useCallback(async () => {
    try {
      setTrips(await travelRepository.getTrips());
    } catch (error) {
      toast.error(message(error, "無法載入旅行"));
    }
  }, []);
  const refreshRoles = useCallback(async () => {
    if (!user) {
      setRoles(new Map());
      return;
    }
    setRoles(await travelRepository.getTripRoles());
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!authReady) return;
    refreshRoles().catch((error) => toast.error(message(error, "無法確認編輯權限")));
  }, [authReady, refreshRoles]);
  const sortedTrips = trips
    .map((trip, index) => ({ trip, index }))
    .sort((left, right) => {
      if (left.trip.mode !== right.trip.mode) return left.trip.mode === "collection" ? 1 : -1;
      return (right.trip.startDate ?? "").localeCompare(left.trip.startDate ?? "") || left.index - right.index;
    })
    .map(({ trip }) => trip);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-8 border-b border-border bg-bg/90 px-4 pb-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="logo-title flex min-w-0 flex-1 items-center gap-5 whitespace-nowrap text-sm font-normal uppercase tracking-[0.08em] text-ink sm:text-[27px] sm:tracking-[0.24em]"><PlaneTakeoff className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />TRIP GOGO</h1>
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin
              ? <AddIconButton context="header" label="新增旅程或收藏" onClick={() => { setEditing(undefined); setOpen(true); }} />
              : null}
            <PendingInvitationsControl onAccepted={refreshRoles} />
            <AuthControl />
          </div>
        </div>
      </header>
      <h2 className="mb-4 text-base font-semibold tracking-[0.16em]">旅程與收藏</h2>
      {trips.length === 0 ? <EmptyState title="尚未建立旅程或收藏" description="" icon="map" /> : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sortedTrips.map((trip) => {
            const canManage = isAdmin || roles.get(trip.id) === "owner";
            const editTrip = () => { setEditing(trip); setOpen(true); };
            const copyTrip = () => {
              travelRepository.duplicateTrip(trip.id).then(() => Promise.all([refresh(), refreshRoles()])).then(() => toast.success("已複製旅行")).catch((error) => toast.error(message(error, "複製失敗")));
            };
            return <TripCard key={trip.id} trip={trip} canManage={canManage} swipeOpen={openItemId === `trip-${trip.id}`} onSwipeOpen={() => openSwipe(`trip-${trip.id}`)} onSwipeClose={closeSwipe} onEdit={editTrip} onCopy={copyTrip} onDelete={() => setDeleting(trip)} />;
          })}
        </div>
      )}
      <TripFormDialog open={open} trip={editing} role={editing ? roles.get(editing.id) : undefined} canManage={Boolean(editing && (isAdmin || roles.get(editing.id) === "owner"))} onOpenChange={setOpen} onSave={(value) => {
        const save = async () => {
          const saved = await travelRepository.saveTrip({ ...value, id: editing?.id, ownerId: editing?.ownerId });
          if (editing && (isAdmin || roles.get(editing.id) === "owner") && value.isPublic !== editing.isPublic) {
            await travelRepository.setTripVisibility(editing.id, value.isPublic);
          }
          return saved;
        };
        save().then(() => Promise.all([refresh(), refreshRoles()])).then(() => {
          setOpen(false);
          toast.success(editing ? "已更新" : value.mode === "collection" ? "已新增收藏" : "已新增旅行");
        }).catch((error) => toast.error(message(error, "儲存失敗")));
      }} />
      <ConfirmDialog open={Boolean(deleting)} title="刪除旅行" description={`確定刪除「${deleting?.name ?? ""}」？旅行內的資料也會一併刪除。`} onOpenChange={(next) => { if (!next) setDeleting(undefined); }} onConfirm={() => {
        if (!deleting) return;
        travelRepository.deleteTrip(deleting.id).then(() => refresh()).then(() => {
          setDeleting(undefined);
          toast.success("已刪除旅行");
        }).catch((error) => toast.error(message(error, "刪除失敗")));
      }} />
    </main>
  );
}

function TripCard({ trip, canManage, swipeOpen, onSwipeOpen, onSwipeClose, onEdit, onCopy, onDelete }: { trip: Trip; canManage: boolean; swipeOpen: boolean; onSwipeOpen: () => void; onSwipeClose: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void }) {
  return <MobileSwipeActions itemId={`trip-${trip.id}`} canEdit={canManage} canDuplicate={canManage} canDelete={canManage} open={swipeOpen} desktopPassthrough mobileFrame onOpen={onSwipeOpen} onClose={onSwipeClose} onEdit={onEdit} onDuplicate={onCopy} onDelete={onDelete}>
  <article className="flex h-[184px] flex-col bg-surface px-5 pt-5 sm:h-[220px] sm:rounded-card sm:border sm:border-border sm:px-6 sm:shadow-soft">
    <Link href={`/trip/${trip.id}`} className="flex items-center gap-2 pb-4 text-sm text-muted hover:text-[#555555]"><MapPin className="h-4 w-4 shrink-0" />{trip.mode === "collection" ? "收藏" : formatTripRange(trip.startDate, trip.endDate)}</Link>
    <div className="border-t border-divider" />
    <Link href={`/trip/${trip.id}`} className={`flex min-w-0 flex-1 items-center text-storeName font-normal hover:text-[#555555] ${HOME_CARD_SPACING}`}><span className="line-clamp-2">{trip.name}</span></Link>
    <div className="hidden border-t border-divider sm:block" />
    <footer className="mt-auto hidden h-12 shrink-0 items-center justify-end gap-4 pr-1 sm:flex">
      {canManage && <><IconButton label="編輯" onClick={onEdit}><SquarePen /></IconButton><IconButton label="複製" onClick={onCopy}><Copy /></IconButton><IconButton label="刪除" onClick={onDelete}><Trash2 /></IconButton></>}
    </footer>
  </article>
  </MobileSwipeActions>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactElement<{ className?: string }> }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-[#555555] sm:h-9 sm:w-9"><span className="[&>svg]:h-4 [&>svg]:w-4">{children}</span></button>;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function displayHomeDate(date?: string | null) {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${year} / ${month} / ${day}`;
}

function formatTripRange(startDate?: string | null, endDate?: string | null) {
  const start = displayHomeDate(startDate);
  const end = displayHomeDate(endDate);
  return start && end ? `${start} – ${end}` : "日期未設定";
}
