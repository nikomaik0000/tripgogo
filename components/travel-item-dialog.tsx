"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TravelItemImageUpload } from "@/components/travel-item-image-upload";
import { useUnsavedChangesDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateOptions } from "@/lib/travel-dates";
import type { TravelItem, TravelItemImageFit, TravelItemType, Trip } from "@/lib/types";

const EMPTY_FORM = { category: "", area: "", date: "", name: "", googleMapsUrl: "", extraLink1: "", extraLink2: "", businessHours: "", note: "", status: "planned", rating: "", completedDate: "", experienceNote: "", consumedItems: "", imageFit: "cover" as TravelItemImageFit };

type TravelItemDialogValue = Pick<TravelItem, "category" | "area" | "date" | "name" | "googleMapsUrl" | "extraLink1" | "extraLink2" | "businessHours" | "note" | "status" | "rating" | "completedDate" | "experienceNote" | "consumedItems" | "imagePath" | "imageFit"> & { imageFile?: File };

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
    setForm(initialForm(item, initialDate, trip.mode));
    setImageFile(undefined);
    setImageRemoved(false);
  }, [initialDate, open, item, trip.mode]);
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
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm(item, initialDate, trip.mode)) || type !== initialType || Boolean(imageFile) || imageRemoved;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesDialog(isDirty, () => onOpenChange(false));
  const categoryField = <Field label="分類"><Input list={categoryList} value={form.category} onChange={(event) => set("category", event.target.value)} /><datalist id={categoryList}>{suggestions("category").map((value) => <option key={value} value={value} />)}</datalist></Field>;
  const areaField = <Field label="地點"><Input list={areaList} value={form.area} onChange={(event) => set("area", event.target.value)} /><datalist id={areaList}>{suggestions("area").map((value) => <option key={value} value={value} />)}</datalist></Field>;
  const dateField = trip.mode === "trip" && !hasFixedEntryDate && <Field label="日期"><Select value={form.date || "unscheduled"} onValueChange={(value) => set("date", value === "unscheduled" ? "" : value)}><SelectTrigger className={desktopTwoColumn ? "w-full" : undefined}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unscheduled">未定</SelectItem>{dateOptions(trip).map((date) => <SelectItem key={date.value} value={date.value}>{date.label}</SelectItem>)}</SelectContent></Select></Field>;
  const nameField = <Field label={type === "place" ? "景點名稱" : "店名"} className={desktopTwoColumn && hasFixedEntryDate ? "sm:col-span-2" : undefined}><Input required value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>;
  const mapsField = <Field label="Google Maps 網址"><Input type="url" value={form.googleMapsUrl} onChange={(event) => set("googleMapsUrl", event.target.value)} /></Field>;
  const firstLinkField = <Field label="其他連結 1（選填）"><Input type="url" value={form.extraLink1} onChange={(event) => set("extraLink1", event.target.value)} /></Field>;
  const secondLinkField = <Field label="其他連結 2（選填）"><Input type="url" value={form.extraLink2} onChange={(event) => set("extraLink2", event.target.value)} /></Field>;
  const businessHoursField = <Field label="營業時間"><Input value={form.businessHours} placeholder="例如：11:00-22:00" onChange={(event) => set("businessHours", event.target.value)} /></Field>;
  const noteField = <Field label="備註" className={desktopTwoColumn ? "sm:col-span-2" : undefined}><Textarea rows={3} value={form.note} onChange={(event) => set("note", event.target.value)} className="h-[140px] min-h-0 w-full" /></Field>;
  const statusField = trip.mode === "collection" && <Field label="狀態"><Select value={form.status} onValueChange={(value) => set("status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planned">{type === "place" ? "想去" : "想吃"}</SelectItem><SelectItem value="completed">{type === "place" ? "去過" : "吃過"}</SelectItem></SelectContent></Select></Field>;
  const completedFields = trip.mode === "collection" && form.status === "completed" && <>
    <Field label="評分（滿分 100，選填）"><Input type="number" min="0" max="100" step="any" value={form.rating} onChange={(event) => set("rating", event.target.value)} /></Field>
    <Field label={`${type === "place" ? "去過" : "吃過"}日期（選填）`}><Input type="date" value={form.completedDate} onChange={(event) => set("completedDate", event.target.value)} className="block min-w-0 max-w-full" /></Field>
    {type === "food" && <Field label="吃了什麼（選填）" className={desktopTwoColumn ? "sm:col-span-2" : undefined}><Input value={form.consumedItems} onChange={(event) => set("consumedItems", event.target.value)} /></Field>}
    <Field label="心得（選填）" className={desktopTwoColumn ? "sm:col-span-2" : undefined}><Textarea rows={3} value={form.experienceNote} onChange={(event) => set("experienceNote", event.target.value)} className="h-[140px] min-h-0 w-full" /></Field>
  </>;
  const tripReviewFields = trip.mode === "trip" && <details className={`${desktopTwoColumn ? "sm:col-span-2" : ""} group min-w-0 border-t border-divider pt-4`}>
    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">評分與心得<ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" /></summary>
    <div className="grid min-w-0 gap-4 pt-4 sm:grid-cols-2">
      <Field label="評分（滿分 100，選填）"><Input type="number" min="0" max="100" step="any" value={form.rating} onChange={(event) => set("rating", event.target.value)} /></Field>
      {type === "food" && <Field label="吃了什麼（選填）"><Input value={form.consumedItems} onChange={(event) => set("consumedItems", event.target.value)} /></Field>}
      <Field label="心得（選填）" className="sm:col-span-2"><Textarea rows={3} value={form.experienceNote} onChange={(event) => set("experienceNote", event.target.value)} className="h-[140px] min-h-0 w-full" /></Field>
    </div>
  </details>;
  const imageField = <div className={desktopTwoColumn ? "space-y-2 text-sm sm:col-span-2" : "space-y-2 text-sm"}><span className="font-medium">圖片（選填）</span><TravelItemImageUpload file={imageFile} imagePath={imageRemoved ? undefined : item?.imagePath} imageFit={form.imageFit} disabled={saving} onFileChange={(file) => { setImageFile(file); setImageRemoved(false); }} onRemove={() => { setImageFile(undefined); setImageRemoved(true); }} onFitChange={(fit) => set("imageFit", fit)} /></div>;
  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogContent title={`${item ? "編輯" : "新增"}${type === "place" ? "地點" : "美食"}`} className={desktopTwoColumn ? "overscroll-contain [scrollbar-gutter:stable] sm:max-w-2xl" : undefined} preventOutsideDismiss onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (!form.name.trim()) return toast.error(`請填寫${type === "place" ? "景點名稱" : "店名"}`);
          if (form.rating !== "" && (!Number.isFinite(Number(form.rating)) || Number(form.rating) < 0 || Number(form.rating) > 100)) return toast.error("評分請輸入 0 到 100");
          setSaving(true);
          try {
            await onSave({ ...form, category: form.category.trim(), area: form.area.trim(), name: form.name.trim(), date: trip.mode === "collection" ? null : form.date || null, status: trip.mode === "collection" ? form.status as TravelItem["status"] : null, rating: form.rating === "" ? null : Number(form.rating), completedDate: trip.mode === "collection" ? form.completedDate || null : null, experienceNote: form.experienceNote.trim(), consumedItems: type === "food" ? form.consumedItems.trim() : "", extraLink1: form.extraLink1.trim() || undefined, extraLink2: form.extraLink2.trim() || undefined, imagePath: imageRemoved ? undefined : item?.imagePath, imageFile });
          } finally {
            setSaving(false);
          }
        }}>
          {allowTypeChange && <Field label="類型"><Select value={type} onValueChange={(value) => onTypeChange?.(value as TravelItemType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="place">地點</SelectItem><SelectItem value="food">美食</SelectItem></SelectContent></Select></Field>}
          {desktopTwoColumn
            ? <div className="grid min-w-0 gap-4 sm:grid-cols-2">{categoryField}{areaField}{nameField}{dateField}{statusField}{businessHoursField}{mapsField}{firstLinkField}{secondLinkField}{noteField}{completedFields}{tripReviewFields}{imageField}</div>
            : <>{categoryField}{areaField}{dateField}{nameField}{statusField}{mapsField}{firstLinkField}{secondLinkField}{businessHoursField}{noteField}{completedFields}{tripReviewFields}{imageField}</>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" disabled={saving} onClick={requestClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    {unsavedChangesDialog}
  </>;
}

function initialForm(item?: TravelItem, initialDate?: string, mode: Trip["mode"] = "trip") {
  return { category: item?.category ?? "", area: item?.area ?? "", date: item?.date ?? initialDate ?? "", name: item?.name ?? "", googleMapsUrl: item?.googleMapsUrl ?? "", extraLink1: item?.extraLink1 ?? "", extraLink2: item?.extraLink2 ?? "", businessHours: item?.businessHours ?? "", note: item?.note ?? "", status: item?.status ?? (mode === "collection" ? "planned" : ""), rating: item?.rating?.toString() ?? "", completedDate: item?.completedDate ?? "", experienceNote: item?.experienceNote ?? "", consumedItems: item?.consumedItems ?? "", imageFit: item?.imageFit ?? "cover" as TravelItemImageFit };
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block min-w-0 space-y-2 text-sm ${className ?? ""}`}><span className="font-medium">{label}</span>{children}</label>;
}
