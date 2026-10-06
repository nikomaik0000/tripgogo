"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayDate, tripDates } from "@/lib/travel-dates";
import type { TravelItem, Trip } from "@/lib/types";

export function AddCollectionItemToTripDialog({ open, item, trips, onOpenChange, onConfirm }: {
  open: boolean;
  item?: TravelItem;
  trips: Trip[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (targetTripId: string, date: string) => Promise<void>;
}) {
  const [targetTripId, setTargetTripId] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const targetTrip = useMemo(() => trips.find((trip) => trip.id === targetTripId), [targetTripId, trips]);
  const dates = useMemo(() => targetTrip ? tripDates(targetTrip) : [], [targetTrip]);

  useEffect(() => {
    if (!open) return;
    const firstTrip = trips[0];
    setTargetTripId(firstTrip?.id ?? "");
    setDate("");
    setSaving(false);
  }, [open, trips]);

  useEffect(() => {
    if (!open) return;
    setDate(dates[0] ?? "");
  }, [dates, open, targetTripId]);

  return <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
    <DialogContent title="加入旅程" preventOutsideDismiss>
      <form className="space-y-5" onSubmit={async (event) => {
        event.preventDefault();
        if (!item || !targetTripId || !date || saving) return;
        setSaving(true);
        try {
          await onConfirm(targetTripId, date);
        } finally {
          setSaving(false);
        }
      }}>
        <Field label="旅程">
          <Select value={targetTripId} onValueChange={setTargetTripId} disabled={saving}>
            <SelectTrigger><SelectValue placeholder="選擇旅程" /></SelectTrigger>
            <SelectContent>{trips.map((trip) => <SelectItem key={trip.id} value={trip.id}>{trip.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="日期">
          <Select value={date} onValueChange={setDate} disabled={saving || dates.length === 0}>
            <SelectTrigger><SelectValue placeholder="選擇日期" /></SelectTrigger>
            <SelectContent>{dates.map((value) => <SelectItem key={value} value={value}>{value}（{displayDate(value)}）</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" disabled={saving || !targetTripId || !date}>{saving ? "加入中…" : "確認加入"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
