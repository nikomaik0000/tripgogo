"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUnsavedChangesDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import type { Flight } from "@/lib/types";

const EMPTY_FORM = { airline: "", flightNumber: "", departurePlace: "", arrivalPlace: "", departureDate: "", departureTime: "", arrivalDate: "", arrivalTime: "", link: "", note: "" };

export function FlightDialog({ open, flight, onOpenChange, onSave }: {
  open: boolean;
  flight?: Flight;
  onOpenChange: (open: boolean) => void;
  onSave: (value: Omit<Flight, "id" | "tripId" | "createdAt" | "updatedAt">) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  useEffect(() => {
    if (!open) return;
    setForm(flight ? { airline: flight.airline, flightNumber: flight.flightNumber, departurePlace: flight.departurePlace, arrivalPlace: flight.arrivalPlace, departureDate: flight.departureDate, departureTime: flight.departureTime, arrivalDate: flight.arrivalDate, arrivalTime: flight.arrivalTime, link: flight.link ?? "", note: flight.note ?? "" } : EMPTY_FORM);
  }, [flight, open]);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const initial = flight ? { airline: flight.airline, flightNumber: flight.flightNumber, departurePlace: flight.departurePlace, arrivalPlace: flight.arrivalPlace, departureDate: flight.departureDate, departureTime: flight.departureTime, arrivalDate: flight.arrivalDate, arrivalTime: flight.arrivalTime, link: flight.link ?? "", note: flight.note ?? "" } : EMPTY_FORM;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesDialog(JSON.stringify(form) !== JSON.stringify(initial), () => onOpenChange(false));
  return <><Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}><DialogContent title={`${flight ? "編輯" : "新增"}機票`} preventOutsideDismiss onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}><form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    if (!form.airline.trim() || !form.flightNumber.trim() || !form.departurePlace.trim() || !form.arrivalPlace.trim() || !form.departureDate || !form.departureTime || !form.arrivalDate || !form.arrivalTime) return toast.error("請完整填寫機票資料");
    onSave({ ...form, airline: form.airline.trim(), flightNumber: form.flightNumber.trim(), departurePlace: form.departurePlace.trim(), arrivalPlace: form.arrivalPlace.trim(), link: form.link.trim() || undefined, note: form.note.trim() || undefined });
  }}>
    <Field label="航空公司"><Input required value={form.airline} onChange={(event) => set("airline", event.target.value)} /></Field>
    <Field label="航班編號"><Input required value={form.flightNumber} onChange={(event) => set("flightNumber", event.target.value)} /></Field>
    <Field label="出發地 / 出發機場"><Input required value={form.departurePlace} onChange={(event) => set("departurePlace", event.target.value)} /></Field>
    <Field label="抵達地 / 抵達機場"><Input required value={form.arrivalPlace} onChange={(event) => set("arrivalPlace", event.target.value)} /></Field>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="出發日期"><Input required type="date" value={form.departureDate} onChange={(event) => set("departureDate", event.target.value)} /></Field><Field label="出發時間"><Input required type="time" value={form.departureTime} onChange={(event) => set("departureTime", event.target.value)} /></Field></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="抵達日期"><Input required type="date" value={form.arrivalDate} onChange={(event) => set("arrivalDate", event.target.value)} /></Field><Field label="抵達時間"><Input required type="time" value={form.arrivalTime} onChange={(event) => set("arrivalTime", event.target.value)} /></Field></div>
    <Field label="其他連結（選填）"><Input type="url" value={form.link} onChange={(event) => set("link", event.target.value)} /></Field>
    <Field label="備註（選填）"><Textarea rows={3} value={form.note} onChange={(event) => set("note", event.target.value)} /></Field>
    <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={requestClose}>取消</Button><Button type="submit">儲存</Button></div>
  </form></DialogContent></Dialog>{unsavedChangesDialog}</>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
