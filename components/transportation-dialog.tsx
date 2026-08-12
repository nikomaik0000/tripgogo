"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Transportation, TransportationInput, TransportationType } from "@/lib/types";

const EMPTY_FORM = {
  type: "rental_car" as TransportationType, company: "", vehicleModel: "", routeName: "",
  startDate: "", startTime: "", endDate: "", endTime: "", departurePlace: "", arrivalPlace: "",
  trainNumber: "", seat: "", carriage: "", ticket: "", reservationNumber: "", cost: "",
  address: "", link: "", googleMapsUrl: "", note: "",
};

export function TransportationDialog({ open, transportation, onOpenChange, onSave }: {
  open: boolean;
  transportation?: Transportation;
  onOpenChange: (open: boolean) => void;
  onSave: (value: TransportationInput) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  useEffect(() => {
    if (!open) return;
    setForm(transportation ? {
      ...EMPTY_FORM, ...transportation,
      company: transportation.type === "rental_car" ? transportation.company : "",
      vehicleModel: transportation.type === "rental_car" ? transportation.vehicleModel : "",
      routeName: transportation.type === "rail" ? transportation.routeName : "",
      trainNumber: transportation.type === "rail" ? transportation.trainNumber ?? "" : "",
      seat: transportation.type === "rail" ? transportation.seat ?? "" : "",
      carriage: transportation.type === "rail" ? transportation.carriage ?? "" : "",
      ticket: transportation.type === "rail" ? transportation.ticket ?? "" : "",
      address: transportation.type === "rental_car" ? transportation.address ?? "" : "",
      googleMapsUrl: transportation.type === "rental_car" ? transportation.googleMapsUrl ?? "" : "",
      reservationNumber: transportation.reservationNumber ?? "", cost: transportation.cost ?? "",
      link: transportation.link ?? "", note: transportation.note ?? "",
    } : EMPTY_FORM);
  }, [open, transportation]);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const optional = (value: string) => value.trim() || undefined;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={`${transportation ? "編輯" : "新增"}交通`}><form className="space-y-4" onSubmit={(event) => {
    event.preventDefault();
    const common = { startDate: form.startDate, startTime: form.startTime, endDate: form.endDate, endTime: form.endTime, departurePlace: form.departurePlace.trim(), arrivalPlace: form.arrivalPlace.trim(), reservationNumber: optional(form.reservationNumber), cost: optional(form.cost), link: optional(form.link), note: optional(form.note) };
    if (!common.startDate || !common.startTime || !common.endDate || !common.endTime || !common.departurePlace || !common.arrivalPlace) return toast.error("請完整填寫日期、時間與地點");
    if (`${common.endDate}T${common.endTime}` < `${common.startDate}T${common.startTime}`) return toast.error("結束時間不可早於開始時間");
    if (form.type === "rental_car") {
      if (!form.company.trim() || !form.vehicleModel.trim()) return toast.error("請填寫租車公司與車型");
      onSave({ ...common, type: "rental_car", company: form.company.trim(), vehicleModel: form.vehicleModel.trim(), address: optional(form.address), googleMapsUrl: optional(form.googleMapsUrl) });
    } else {
      if (!form.routeName.trim()) return toast.error("請填寫路線 / 列車名稱");
      onSave({ ...common, type: "rail", routeName: form.routeName.trim(), trainNumber: optional(form.trainNumber), seat: optional(form.seat), carriage: optional(form.carriage), ticket: optional(form.ticket) });
    }
  }}>
    <Field label="交通類型"><Select value={form.type} disabled={Boolean(transportation)} onValueChange={(value) => set("type", value as TransportationType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rental_car">租車</SelectItem><SelectItem value="rail">JR / 鐵路</SelectItem></SelectContent></Select></Field>
    {form.type === "rental_car" ? <><Field label="租車公司"><Input required value={form.company} onChange={(event) => set("company", event.target.value)} /></Field><Field label="車型"><Input required value={form.vehicleModel} onChange={(event) => set("vehicleModel", event.target.value)} /></Field></> : <><Field label="路線 / 列車名稱"><Input required value={form.routeName} onChange={(event) => set("routeName", event.target.value)} /></Field><Field label="列車班次 / 車次（選填）"><Input value={form.trainNumber} onChange={(event) => set("trainNumber", event.target.value)} /></Field></>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label={form.type === "rental_car" ? "取車日期" : "出發日期"}><Input required type="date" value={form.startDate} onChange={(event) => { set("startDate", event.target.value); if (!form.endDate) set("endDate", event.target.value); }} /></Field><Field label={form.type === "rental_car" ? "取車時間" : "出發時間"}><Input required type="time" value={form.startTime} onChange={(event) => set("startTime", event.target.value)} /></Field></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label={form.type === "rental_car" ? "還車日期" : "抵達日期"}><Input required type="date" value={form.endDate} onChange={(event) => set("endDate", event.target.value)} /></Field><Field label={form.type === "rental_car" ? "還車時間" : "抵達時間"}><Input required type="time" value={form.endTime} onChange={(event) => set("endTime", event.target.value)} /></Field></div>
    <Field label={form.type === "rental_car" ? "取車地點" : "出發站"}><Input required value={form.departurePlace} onChange={(event) => set("departurePlace", event.target.value)} /></Field>
    <Field label={form.type === "rental_car" ? "還車地點" : "抵達站"}><Input required value={form.arrivalPlace} onChange={(event) => set("arrivalPlace", event.target.value)} /></Field>
    {form.type === "rail" && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="座位（選填）"><Input value={form.seat} onChange={(event) => set("seat", event.target.value)} /></Field><Field label="車廂（選填）"><Input value={form.carriage} onChange={(event) => set("carriage", event.target.value)} /></Field><Field label="車票 / Pass（選填）"><Input value={form.ticket} onChange={(event) => set("ticket", event.target.value)} /></Field></div>}
    <Field label="預約編號（選填）"><Input value={form.reservationNumber} onChange={(event) => set("reservationNumber", event.target.value)} /></Field>
    <Field label="費用（選填）"><Input value={form.cost} onChange={(event) => set("cost", event.target.value)} /></Field>
    {form.type === "rental_car" && <><Field label="地址（選填）"><Input value={form.address} onChange={(event) => set("address", event.target.value)} /></Field><Field label="Google Maps URL（取車地點，選填）"><Input type="url" value={form.googleMapsUrl} onChange={(event) => set("googleMapsUrl", event.target.value)} /></Field></>}
    <Field label="預約 / 官方網址（選填）"><Input type="url" value={form.link} onChange={(event) => set("link", event.target.value)} /></Field>
    <Field label="備註（選填）"><Textarea rows={3} value={form.note} onChange={(event) => set("note", event.target.value)} /></Field>
    <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit">儲存</Button></div>
  </form></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
