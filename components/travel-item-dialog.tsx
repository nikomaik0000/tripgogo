"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUnsavedChangesDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateOptions } from "@/lib/travel-dates";
import type { TravelItem, TravelItemType, Trip } from "@/lib/types";

const EMPTY_FORM = { category: "", area: "", date: "", name: "", googleMapsUrl: "", extraLink1: "", extraLink2: "", businessHours: "", note: "" };

export function TravelItemDialog({ open, type, trip, item, items, initialDate, allowTypeChange = false, onTypeChange, onOpenChange, onSave }: {
  open: boolean; type: TravelItemType; trip: Trip; item?: TravelItem; items: TravelItem[];
  initialDate?: string;
  allowTypeChange?: boolean;
  onTypeChange?: (type: TravelItemType) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (value: Pick<TravelItem, "category" | "area" | "date" | "name" | "googleMapsUrl" | "extraLink1" | "extraLink2" | "businessHours" | "note">) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const categoryList = useId();
  const areaList = useId();
  useEffect(() => {
    if (!open) return;
    setForm(initialForm(item, initialDate));
  }, [initialDate, open, item]);
  const suggestions = (key: "category" | "area") => [
    ...new Set(
      items
        .filter((value) => key === "area" || value.type === type)
        .map((value) => value[key])
        .filter(Boolean)
    ),
  ].sort();
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const hasFixedEntryDate = !item && Boolean(initialDate);
  const initialType = item?.type ?? (allowTypeChange ? "place" : type);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm(item, initialDate)) || type !== initialType;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesDialog(isDirty, () => onOpenChange(false));
  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogContent title={`${item ? "編輯" : "新增"}${type === "place" ? "地點" : "美食"}`} preventOutsideDismiss onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (!form.name.trim()) return toast.error(`請填寫${type === "place" ? "景點名稱" : "店名"}`);
          onSave({ ...form, category: form.category.trim(), area: form.area.trim(), name: form.name.trim(), date: form.date || null, extraLink1: form.extraLink1.trim() || undefined, extraLink2: form.extraLink2.trim() || undefined });
        }}>
          {allowTypeChange && <Field label="類型"><Select value={type} onValueChange={(value) => onTypeChange?.(value as TravelItemType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="place">地點</SelectItem><SelectItem value="food">美食</SelectItem></SelectContent></Select></Field>}
          <Field label="分類"><Input list={categoryList} value={form.category} onChange={(e) => set("category", e.target.value)} /><datalist id={categoryList}>{suggestions("category").map((value) => <option key={value} value={value} />)}</datalist></Field>
          <Field label="地點"><Input list={areaList} value={form.area} onChange={(e) => set("area", e.target.value)} /><datalist id={areaList}>{suggestions("area").map((value) => <option key={value} value={value} />)}</datalist></Field>
          {!hasFixedEntryDate && <Field label="日期"><Select value={form.date || "unscheduled"} onValueChange={(value) => set("date", value === "unscheduled" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unscheduled">未定</SelectItem>{dateOptions(trip).map((date) => <SelectItem key={date.value} value={date.value}>{date.label}</SelectItem>)}</SelectContent></Select></Field>}
          <Field label={type === "place" ? "景點名稱" : "店名"}><Input required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Google Maps 網址"><Input type="url" value={form.googleMapsUrl} onChange={(e) => set("googleMapsUrl", e.target.value)} /></Field>
          <Field label="其他連結 1（選填）"><Input type="url" value={form.extraLink1} onChange={(e) => set("extraLink1", e.target.value)} /></Field>
          <Field label="其他連結 2（選填）"><Input type="url" value={form.extraLink2} onChange={(e) => set("extraLink2", e.target.value)} /></Field>
          <Field label="營業時間"><Input value={form.businessHours} placeholder="例如：11:00-22:00" onChange={(e) => set("businessHours", e.target.value)} /></Field>
          <Field label="備註"><Textarea rows={3} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={requestClose}>取消</Button><Button type="submit">儲存</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    {unsavedChangesDialog}
  </>;
}

function initialForm(item?: TravelItem, initialDate?: string) {
  return { category: item?.category ?? "", area: item?.area ?? "", date: item?.date ?? initialDate ?? "", name: item?.name ?? "", googleMapsUrl: item?.googleMapsUrl ?? "", extraLink1: item?.extraLink1 ?? "", extraLink2: item?.extraLink2 ?? "", businessHours: item?.businessHours ?? "", note: item?.note ?? "" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
