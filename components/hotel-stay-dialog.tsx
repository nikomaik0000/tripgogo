"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUnsavedChangesDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import type { HotelStay } from "@/lib/types";

const EMPTY_FORM = { name: "", checkInDate: "", checkOutDate: "", checkInTime: "", checkOutTime: "", address: "", phone: "", googleMapsUrl: "", link: "", note: "" };

export function HotelStayDialog({ open, stay, onOpenChange, onSave }: {
  open: boolean;
  stay?: HotelStay;
  onOpenChange: (open: boolean) => void;
  onSave: (value: Omit<HotelStay, "id" | "tripId" | "createdAt" | "updatedAt">) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  useEffect(() => {
    if (!open) return;
    setForm(stay ? { name: stay.name, checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, checkInTime: stay.checkInTime ?? "", checkOutTime: stay.checkOutTime ?? "", address: stay.address ?? "", phone: stay.phone ?? "", googleMapsUrl: stay.googleMapsUrl ?? "", link: stay.link ?? "", note: stay.note ?? "" } : EMPTY_FORM);
  }, [open, stay]);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const initial = stay ? { name: stay.name, checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, checkInTime: stay.checkInTime ?? "", checkOutTime: stay.checkOutTime ?? "", address: stay.address ?? "", phone: stay.phone ?? "", googleMapsUrl: stay.googleMapsUrl ?? "", link: stay.link ?? "", note: stay.note ?? "" } : EMPTY_FORM;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesDialog(JSON.stringify(form) !== JSON.stringify(initial), () => onOpenChange(false));
  return <><Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}><DialogContent title={`${stay ? "編輯" : "新增"}飯店`} preventOutsideDismiss onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}><form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.checkInDate || !form.checkOutDate) return toast.error("請填寫飯店名稱與入住日期");
    onSave({ name: form.name.trim(), checkInDate: form.checkInDate, checkOutDate: form.checkOutDate, checkInTime: form.checkInTime || undefined, checkOutTime: form.checkOutTime || undefined, address: form.address.trim() || undefined, phone: form.phone.trim() || undefined, googleMapsUrl: form.googleMapsUrl.trim() || undefined, link: form.link.trim() || undefined, note: form.note.trim() || undefined });
  }}>
    <Field label="飯店名稱"><Input required value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Check-in 日期"><Input required type="date" value={form.checkInDate} onChange={(event) => set("checkInDate", event.target.value)} /></Field><Field label="Check-out 日期"><Input required type="date" value={form.checkOutDate} onChange={(event) => set("checkOutDate", event.target.value)} /></Field></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Check-in 時間（選填）"><Input type="time" value={form.checkInTime} onChange={(event) => set("checkInTime", event.target.value)} /></Field><Field label="Check-out 時間（選填）"><Input type="time" value={form.checkOutTime} onChange={(event) => set("checkOutTime", event.target.value)} /></Field></div>
    <Field label="地址（選填）"><Input value={form.address} onChange={(event) => set("address", event.target.value)} /></Field>
    <Field label="電話（選填）"><Input type="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
    <Field label="Google Maps URL（選填）"><Input type="url" value={form.googleMapsUrl} onChange={(event) => set("googleMapsUrl", event.target.value)} /></Field>
    <Field label="其他連結（選填）"><Input type="url" value={form.link} onChange={(event) => set("link", event.target.value)} /></Field>
    <Field label="備註（選填）"><Textarea rows={3} value={form.note} onChange={(event) => set("note", event.target.value)} /></Field>
    <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={requestClose}>取消</Button><Button type="submit">儲存</Button></div>
  </form></DialogContent></Dialog>{unsavedChangesDialog}</>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
