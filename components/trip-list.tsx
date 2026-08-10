"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CirclePlus, Copy, MapPin, PlaneTakeoff, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AuthControl } from "@/components/auth-control";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TripFormDialog } from "@/components/trip-form-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { displayDate } from "@/lib/travel-dates";
import { travelRepository } from "@/lib/travel-repository";
import type { Trip, TripRole } from "@/lib/types";

const HOME_CARD_SPACING = "py-5";

export function TripList({ initialTrips }: { initialTrips: Trip[] }) {
  const { user, ready: authReady } = useAuth();
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [roles, setRoles] = useState<Map<string, TripRole>>(new Map());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trip>();
  const [deleting, setDeleting] = useState<Trip>();

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

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-8 border-b border-border bg-bg/90 px-4 pb-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="logo-title flex min-w-0 flex-1 items-center gap-5 whitespace-nowrap text-sm font-normal uppercase tracking-[0.08em] text-ink sm:text-[27px] sm:tracking-[0.24em]"><PlaneTakeoff className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" />TRAVEL GOGO</h1>
          <div className="flex shrink-0 items-center gap-2">
            <AuthControl />
            {user
              ? <Button size="icon" variant="primary" aria-label="新增旅行" title="新增旅行" className="h-11 w-11 sm:h-9 sm:w-9" onClick={() => { setEditing(undefined); setOpen(true); }}><CirclePlus className="h-5 w-5" /></Button>
              : <span aria-hidden="true" className="h-11 w-11 sm:h-9 sm:w-9" />}
          </div>
        </div>
      </header>
      <h2 className="mb-4 text-base font-semibold tracking-[0.16em]">旅行列表</h2>
      {trips.length === 0 ? <EmptyState title="尚未建立旅行" description="" icon="map" /> : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => {
            const canEdit = roles.has(trip.id);
            return <article key={trip.id} className="flex h-[260px] flex-col rounded-card border border-border bg-surface px-6 pt-6 shadow-soft">
              <Link href={`/trip/${trip.id}`} className="flex items-center gap-2 pb-5 text-sm text-muted hover:text-ink"><MapPin className="h-5 w-5 shrink-0" />{displayDate(trip.startDate)} – {displayDate(trip.endDate)}</Link>
              <div className="border-t border-divider" />
              <Link href={`/trip/${trip.id}`} className={`flex min-w-0 flex-1 items-center text-storeName font-normal hover:text-accent-coffee ${HOME_CARD_SPACING}`}><span className="line-clamp-2 min-h-[3.25rem]">{trip.name}</span></Link>
              <div className="border-t border-divider" />
              <footer className="mt-auto flex h-14 shrink-0 items-center justify-end gap-4 pr-1">
                {canEdit && <><IconButton label="編輯" onClick={() => { setEditing(trip); setOpen(true); }}><SquarePen /></IconButton><IconButton label="複製" onClick={() => {
                  travelRepository.duplicateTrip(trip.id).then(() => Promise.all([refresh(), refreshRoles()])).then(() => toast.success("已複製旅行")).catch((error) => toast.error(message(error, "複製失敗")));
                }}><Copy /></IconButton>{roles.get(trip.id) === "owner" && <IconButton label="刪除" onClick={() => setDeleting(trip)}><Trash2 /></IconButton>}</>}
              </footer>
            </article>;
          })}
        </div>
      )}
      <TripFormDialog open={open} trip={editing} onOpenChange={setOpen} onSave={(value) => {
        travelRepository.saveTrip({ ...value, id: editing?.id, ownerId: editing?.ownerId }).then(() => Promise.all([refresh(), refreshRoles()])).then(() => {
          setOpen(false);
          toast.success(editing ? "已更新旅行" : "已新增旅行");
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

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactElement<{ className?: string }> }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink sm:h-9 sm:w-9"><span className="[&>svg]:h-5 [&>svg]:w-5">{children}</span></button>;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
