"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TravelItemImageUpload } from "@/components/travel-item-image-upload";
import { useUnsavedChangesDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateOptions } from "@/lib/travel-dates";
import type { TravelItem, TravelItemImageFit, TravelItemType, Trip } from "@/lib/types";

const EMPTY_FORM = { category: "", area: "", date: "", name: "", googleMapsUrl: "", extraLink1: "", extraLink2: "", businessHours: "", note: "", imageFit: "cover" as TravelItemImageFit };

type TravelItemDialogValue = Pick<TravelItem, "category" | "area" | "date" | "name" | "googleMapsUrl" | "extraLink1" | "extraLink2" | "businessHours" | "note" | "imagePath" | "imageFit"> & { imageFile?: File };

export function TravelItemDialog({ open, type, trip, item, items, initialDate, allowTypeChange = false, desktopTwoColumn = false, onTypeChange, onOpenChange, onSave }: {
  open: boolean; type: TravelItemType; trip: Trip; item?: TravelItem; items: TravelItem[];
  initialDate?: string;
  allowTypeChange?: boolean;
  desktopTwoColumn?: boolean;
  onTypeChange?: (type: TravelItemType) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (value: TravelItemDialogValue) => Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File>();
  const [imageRemoved, setImageRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const categoryList = useId();
  const areaList = useId();
  useEffect(() => {
    if (!open) return;
    setForm(initialForm(item, initialDate));
    setImageFile(undefined);
    setImageRemoved(false);
  }, [initialDate, open, item]);
  const suggestions = (key: "category" | "area") => [
    ...new Set(
      items
        .filter((value) => key === "area" || value.type === type)
        .map((value) => value[key])
        .filter(Boolean)
    ),
  ].sort();
  const set = (key: keyof typeof form, value: string | TravelItemImageFit) => setForm((current) => ({ ...current, [key]: value }));
  const hasFixedEntryDate = !item && Boolean(initialDate);
  const initialType = item?.type ?? (allowTypeChange ? "place" : type);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm(item, initialDate)) || type !== initialType || Boolean(imageFile) || imageRemoved;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesDialog(isDirty, () => onOpenChange(false));
  const categoryField = <Field label="分類"><Input list={categoryList} value={form.category} onChange={(event) => set("category", event.target.value)} /><datalist id={categoryList}>{suggestions("category").map((value) => <option key={value} value={value} />)}</datalist></Field>;
  const areaField = <Field label="地點"><Input list={areaList} value={form.area} onChange={(event) => set("area", event.target.value)} /><datalist id={areaList}>{suggestions("area").map((value) => <option key={value} value={value} />)}</datalist></Field>;
  const dateField = !hasFixedEntryDate && <Field label="日期"><Select value={form.date || "unscheduled"} onValueChange={(value) => set("date", value === "unscheduled" ? "" : value)}><SelectTrigger className={desktopTwoColumn ? "w-full" : undefined}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unscheduled">未定</SelectItem>{dateOptions(trip).map((date) => <SelectItem key={date.value} value={date.value}>{date.label}</SelectItem>)}</SelectContent></Select></Field>;
  const nameField = <Field label={type === "place" ? "景點名稱" : "店名"} className={desktopTwoColumn && hasFixedEntryDate ? "sm:col-span-2" : undefined}><Input required value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>;
  const mapsField = <Field label="Google Maps 網址"><Input type="url" value={form.googleMapsUrl} onChange={(event) => set("googleMapsUrl", event.target.value)} /></Field>;
  const firstLinkField = <Field label="其他連結 1（選填）"><Input type="url" value={form.extraLink1} onChange={(event) => set("extraLink1", event.target.value)} /></Field>;
  const secondLinkField = <Field label="其他連結 2（選填）"><Input type="url" value={form.extraLink2} onChange={(event) => set("extraLink2", event.target.value)} /></Field>;
  const businessHoursField = <Field label="營業時間"><Input value={form.businessHours} placeholder="例如：11:00-22:00" onChange={(event) => set("businessHours", event.target.value)} /></Field>;
  const noteField = <Field label="備註" className={desktopTwoColumn ? "sm:col-span-2" : undefined}><Textarea rows={3} value={form.note} onChange={(event) => set("note", event.target.value)} className="h-[140px] min-h-0 w-full" /></Field>;
  const imageField = <div className={desktopTwoColumn ? "space-y-2 text-sm sm:col-span-2" : "space-y-2 text-sm"}><span className="font-medium">圖片（選填）</span><TravelItemImageUpload file={imageFile} imagePath={imageRemoved ? undefined : item?.imagePath} imageFit={form.imageFit} disabled={saving} onFileChange={(file) => { setImageFile(file); setImageRemoved(false); }} onRemove={() => { setImageFile(undefined); setImageRemoved(true); }} onFitChange={(fit) => set("imageFit", fit)} /></div>;
  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogContent title={`${item ? "編輯" : "新增"}${type === "place" ? "地點" : "美食"}`} className={desktopTwoColumn ? "overscroll-contain [scrollbar-gutter:stable] sm:max-w-2xl" : undefined} preventOutsideDismiss onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (!form.name.trim()) return toast.error(`請填寫${type === "place" ? "景點名稱" : "店名"}`);
          setSaving(true);
          try {
            await onSave({ ...form, category: form.category.trim(), area: form.area.trim(), name: form.name.trim(), date: form.date || null, extraLink1: form.extraLink1.trim() || undefined, extraLink2: form.extraLink2.trim() || undefined, imagePath: imageRemoved ? undefined : item?.imagePath, imageFile });
          } finally {
            setSaving(false);
          }
        }}>
          {allowTypeChange && <Field label="類型"><Select value={type} onValueChange={(value) => onTypeChange?.(value as TravelItemType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="place">地點</SelectItem><SelectItem value="food">美食</SelectItem></SelectContent></Select></Field>}
          {desktopTwoColumn
            ? <div className="grid gap-4 sm:grid-cols-2">{categoryField}{areaField}{nameField}{dateField}{businessHoursField}{mapsField}{firstLinkField}{secondLinkField}{noteField}{imageField}</div>
            : <>{categoryField}{areaField}{dateField}{nameField}{mapsField}{firstLinkField}{secondLinkField}{businessHoursField}{noteField}{imageField}</>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" disabled={saving} onClick={requestClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    {unsavedChangesDialog}
  </>;
}

function initialForm(item?: TravelItem, initialDate?: string) {
  return { category: item?.category ?? "", area: item?.area ?? "", date: item?.date ?? initialDate ?? "", name: item?.name ?? "", googleMapsUrl: item?.googleMapsUrl ?? "", extraLink1: item?.extraLink1 ?? "", extraLink2: item?.extraLink2 ?? "", businessHours: item?.businessHours ?? "", note: item?.note ?? "", imageFit: item?.imageFit ?? "cover" as TravelItemImageFit };
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block space-y-2 text-sm ${className ?? ""}`}><span className="font-medium">{label}</span>{children}</label>;
}
