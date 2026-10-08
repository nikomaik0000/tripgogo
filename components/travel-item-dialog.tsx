"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TravelItemImageUpload } from "@/components/travel-item-image-upload";
import { useUnsavedChangesDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatClosedDaysText, validateClosedRuleValues } from "@/lib/closed-days";
import { dateOptions } from "@/lib/travel-dates";
import type { ClosedRuleType, ClosedRuleValue, TravelItem, TravelItemImageFit, TravelItemType, Trip } from "@/lib/types";

type ClosedRuleSelection = ClosedRuleType | "none";

const EMPTY_FORM = { category: "", area: "", date: "", name: "", googleMapsUrl: "", extraLink1: "", extraLink2: "", businessHours: "", closedDaysText: "", closedRuleType: "none" as ClosedRuleSelection, closedRuleValues: [] as ClosedRuleValue[], note: "", status: "planned", rating: "", completedDate: "", experienceNote: "", consumedItems: "", imageFit: "cover" as TravelItemImageFit };

type TravelItemDialogValue = Pick<TravelItem, "category" | "area" | "date" | "name" | "googleMapsUrl" | "extraLink1" | "extraLink2" | "businessHours" | "closedDaysText" | "closedRuleType" | "closedRuleValues" | "note" | "status" | "rating" | "completedDate" | "experienceNote" | "consumedItems" | "imagePath" | "imageFit"> & { imageFile?: File };

const WEEKDAYS = [{ value: 1, label: "一" }, { value: 2, label: "二" }, { value: 3, label: "三" }, { value: 4, label: "四" }, { value: 5, label: "五" }, { value: 6, label: "六" }, { value: 0, label: "日" }] as const;
const MONTH_DATES = Array.from({ length: 31 }, (_, index) => index + 1);

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
  const [displayOnlyRule, setDisplayOnlyRule] = useState(false);
  const [saving, setSaving] = useState(false);
  const categoryList = useId();
  const areaList = useId();
  useEffect(() => {
    if (!open) return;
    setForm(initialForm(item, initialDate, trip.mode));
    setImageFile(undefined);
    setImageRemoved(false);
    setDisplayOnlyRule(Boolean(item?.closedDaysText && !item.closedRuleType));
  }, [initialDate, open, item, trip.mode]);
  const suggestions = (key: "category" | "area") => [
    ...new Set(
      items
        .filter((value) => key === "area" || value.type === type)
        .map((value) => value[key])
        .filter(Boolean)
    ),
  ].sort();
  const set = (key: keyof typeof form, value: (typeof form)[keyof typeof form]) => setForm((current) => ({ ...current, [key]: value }));
  const setClosedRuleValues = (values: ClosedRuleValue[]) => setForm((current) => ({
    ...current,
    closedRuleValues: values,
    closedDaysText: current.closedRuleType === "none" || current.closedRuleType === "irregular" ? current.closedDaysText : formatClosedDaysText(current.closedRuleType, values),
  }));
  const changeClosedRuleType = (value: ClosedRuleSelection) => {
    setDisplayOnlyRule(false);
    setForm((current) => {
      if (value === "none") return { ...current, closedDaysText: "", closedRuleType: value, closedRuleValues: [] };
      if (value === "irregular") return { ...current, closedDaysText: current.closedRuleType === "irregular" && current.closedDaysText ? current.closedDaysText : "不定休", closedRuleType: value, closedRuleValues: [] };
      const values: ClosedRuleValue[] = value === "specific_date" ? [""] : [];
      return { ...current, closedDaysText: "", closedRuleType: value, closedRuleValues: values };
    });
  };
  const hasFixedEntryDate = !item && Boolean(initialDate);
  const initialType = item?.type ?? (allowTypeChange ? "place" : type);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm(item, initialDate, trip.mode)) || displayOnlyRule !== Boolean(item?.closedDaysText && !item.closedRuleType) || type !== initialType || Boolean(imageFile) || imageRemoved;
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesDialog(isDirty, () => onOpenChange(false));
  const categoryField = <Field label="分類"><Input list={categoryList} value={form.category} onChange={(event) => set("category", event.target.value)} /><datalist id={categoryList}>{suggestions("category").map((value) => <option key={value} value={value} />)}</datalist></Field>;
  const areaField = <Field label="地點"><Input list={areaList} value={form.area} onChange={(event) => set("area", event.target.value)} /><datalist id={areaList}>{suggestions("area").map((value) => <option key={value} value={value} />)}</datalist></Field>;
  const dateField = trip.mode === "trip" && !hasFixedEntryDate && <Field label="日期"><Select value={form.date || "unscheduled"} onValueChange={(value) => set("date", value === "unscheduled" ? "" : value)}><SelectTrigger className={desktopTwoColumn ? "w-full" : undefined}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unscheduled">未定</SelectItem>{dateOptions(trip).map((date) => <SelectItem key={date.value} value={date.value}>{date.label}</SelectItem>)}</SelectContent></Select></Field>;
  const nameField = <Field label={type === "place" ? "景點名稱" : "店名"} className={desktopTwoColumn && hasFixedEntryDate ? "sm:col-span-2" : undefined}><Input required value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>;
  const mapsField = <Field label="Google Maps 網址"><Input type="url" value={form.googleMapsUrl} onChange={(event) => set("googleMapsUrl", event.target.value)} /></Field>;
  const firstLinkField = <Field label="其他連結 1（選填）"><Input type="url" value={form.extraLink1} onChange={(event) => set("extraLink1", event.target.value)} /></Field>;
  const secondLinkField = <Field label={type === "food" ? "訂位連結（選填）" : "訂票連結（選填）"}><Input type="url" value={form.extraLink2} onChange={(event) => set("extraLink2", event.target.value)} /></Field>;
  const businessHoursField = <Field label="營業時間"><Input value={form.businessHours} placeholder="例如：11:00-22:00" onChange={(event) => set("businessHours", event.target.value)} /></Field>;
  const closedDaysField = <ClosedDaysField form={form} desktopTwoColumn={desktopTwoColumn} onTypeChange={changeClosedRuleType} onValuesChange={setClosedRuleValues} onTextChange={(value) => set("closedDaysText", value)} />;
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
          const closedRuleType = form.closedRuleType === "none" || displayOnlyRule ? null : form.closedRuleType;
          const closedRuleValidation = validateClosedRuleValues(closedRuleType, closedRuleType ? form.closedRuleValues : null);
          if (closedRuleValidation.error) return toast.error(closedRuleValidation.error);
          if (closedRuleType === "irregular" && !form.closedDaysText.trim()) return toast.error("請填寫簡短的店休日顯示文字");
          const closedDaysText = displayOnlyRule
            ? form.closedDaysText.trim() || undefined
            : closedRuleType
            ? closedRuleType === "irregular" ? form.closedDaysText.trim() : formatClosedDaysText(closedRuleType, closedRuleValidation.values ?? [])
            : undefined;
          setSaving(true);
          try {
            await onSave({ ...form, category: form.category.trim(), area: form.area.trim(), name: form.name.trim(), date: trip.mode === "collection" ? null : form.date || null, status: trip.mode === "collection" ? form.status as TravelItem["status"] : null, rating: form.rating === "" ? null : Number(form.rating), completedDate: trip.mode === "collection" ? form.completedDate || null : null, experienceNote: form.experienceNote.trim(), consumedItems: type === "food" ? form.consumedItems.trim() : "", extraLink1: form.extraLink1.trim() || undefined, extraLink2: form.extraLink2.trim() || undefined, closedDaysText, closedRuleType, closedRuleValues: closedRuleValidation.values, imagePath: imageRemoved ? undefined : item?.imagePath, imageFile });
          } finally {
            setSaving(false);
          }
        }}>
          {allowTypeChange && <Field label="類型"><Select value={type} onValueChange={(value) => onTypeChange?.(value as TravelItemType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="place">地點</SelectItem><SelectItem value="food">美食</SelectItem></SelectContent></Select></Field>}
          {desktopTwoColumn
            ? <div className="grid min-w-0 gap-4 sm:grid-cols-2">{categoryField}{areaField}{nameField}{dateField}{statusField}{businessHoursField}{closedDaysField}{mapsField}{firstLinkField}{secondLinkField}{noteField}{completedFields}{tripReviewFields}{imageField}</div>
            : <>{categoryField}{areaField}{dateField}{nameField}{statusField}{mapsField}{firstLinkField}{secondLinkField}{businessHoursField}{closedDaysField}{noteField}{completedFields}{tripReviewFields}{imageField}</>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" disabled={saving} onClick={requestClose}>取消</Button><Button type="submit" disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    {unsavedChangesDialog}
  </>;
}

function initialForm(item?: TravelItem, initialDate?: string, mode: Trip["mode"] = "trip") {
  const closedRuleType: ClosedRuleSelection = item?.closedRuleType ?? (item?.closedDaysText ? "irregular" : "none");
  return { category: item?.category ?? "", area: item?.area ?? "", date: item?.date ?? initialDate ?? "", name: item?.name ?? "", googleMapsUrl: item?.googleMapsUrl ?? "", extraLink1: item?.extraLink1 ?? "", extraLink2: item?.extraLink2 ?? "", businessHours: item?.businessHours ?? "", closedDaysText: item?.closedDaysText ?? "", closedRuleType, closedRuleValues: item?.closedRuleValues ?? [], note: item?.note ?? "", status: item?.status ?? (mode === "collection" ? "planned" : ""), rating: item?.rating?.toString() ?? "", completedDate: item?.completedDate ?? "", experienceNote: item?.experienceNote ?? "", consumedItems: item?.consumedItems ?? "", imageFit: item?.imageFit ?? "cover" as TravelItemImageFit };
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block min-w-0 space-y-2 text-sm ${className ?? ""}`}><span className="font-medium">{label}</span>{children}</label>;
}

function ClosedDaysField({ form, desktopTwoColumn, onTypeChange, onValuesChange, onTextChange }: {
  form: typeof EMPTY_FORM;
  desktopTwoColumn: boolean;
  onTypeChange: (value: ClosedRuleSelection) => void;
  onValuesChange: (values: ClosedRuleValue[]) => void;
  onTextChange: (value: string) => void;
}) {
  const numericValues = form.closedRuleValues.filter((value): value is number => typeof value === "number");
  const dateValues = form.closedRuleValues.filter((value): value is string => typeof value === "string");
  const irregularPreset = form.closedDaysText === "不定休" || form.closedDaysText === "依商場公告" ? form.closedDaysText : "custom";
  const toggleNumber = (value: number) => onValuesChange(numericValues.includes(value) ? numericValues.filter((entry) => entry !== value) : [...numericValues, value]);
  return <div className={`min-w-0 space-y-3 text-sm ${desktopTwoColumn ? "sm:col-span-2" : ""}`}>
    <div className="space-y-2">
      <span className="font-medium">店休日</span>
      <Select value={form.closedRuleType} onValueChange={(value) => onTypeChange(value as ClosedRuleSelection)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">無</SelectItem><SelectItem value="weekday">每週</SelectItem><SelectItem value="monthly_date">每月固定日期</SelectItem><SelectItem value="specific_date">特定日期</SelectItem><SelectItem value="irregular">不定休</SelectItem></SelectContent></Select>
    </div>
    {form.closedRuleType === "weekday" && <div className="space-y-2"><span className="text-xs text-muted">選擇固定店休日</span><div className="grid grid-cols-7 gap-2">{WEEKDAYS.map((weekday) => <button key={weekday.value} type="button" aria-pressed={numericValues.includes(weekday.value)} onClick={() => toggleNumber(weekday.value)} className={`h-9 rounded-[5px] border text-xs transition-colors ${numericValues.includes(weekday.value) ? "border-ink bg-searchBackground text-ink" : "border-border bg-surface text-muted hover:text-ink"}`}>{weekday.label}</button>)}</div></div>}
    {form.closedRuleType === "monthly_date" && <div className="space-y-2"><span className="text-xs text-muted">選擇每月固定日期</span><div className="grid grid-cols-7 gap-2">{MONTH_DATES.map((date) => <button key={date} type="button" aria-pressed={numericValues.includes(date)} onClick={() => toggleNumber(date)} className={`h-9 rounded-[5px] border text-xs transition-colors ${numericValues.includes(date) ? "border-ink bg-searchBackground text-ink" : "border-border bg-surface text-muted hover:text-ink"}`}>{date}</button>)}</div></div>}
    {form.closedRuleType === "specific_date" && <div className="space-y-2"><span className="text-xs text-muted">可加入多筆日期，標籤最多顯示前 2 筆</span>{dateValues.map((date, index) => <div key={index} className="flex min-w-0 items-center gap-2"><Input type="date" value={date} onChange={(event) => onValuesChange(dateValues.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry))} className="block min-w-0 max-w-full" /><button type="button" aria-label="移除特定日期" title="移除特定日期" onClick={() => onValuesChange(dateValues.filter((_, entryIndex) => entryIndex !== index))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[5px] text-muted hover:bg-searchBackground hover:text-ink"><X className="h-4 w-4" /></button></div>)}<Button type="button" size="sm" variant="outline" onClick={() => onValuesChange([...dateValues, ""])}><Plus className="h-4 w-4" />新增日期</Button></div>}
    {form.closedRuleType === "irregular" && <div className="space-y-2"><Select value={irregularPreset} onValueChange={(value) => onTextChange(value === "custom" ? "" : value)}><SelectTrigger aria-label="不定休顯示文字"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="不定休">不定休</SelectItem><SelectItem value="依商場公告">依商場公告</SelectItem><SelectItem value="custom">自訂短文字</SelectItem></SelectContent></Select>{irregularPreset === "custom" && <Input value={form.closedDaysText} maxLength={32} placeholder="簡短顯示文字（最多 32 字）" onChange={(event) => onTextChange(event.target.value)} />}</div>}
    {form.closedRuleType !== "none" && form.closedDaysText && <p className="min-w-0 truncate text-xs text-muted" title={form.closedDaysText}>預覽：休｜{form.closedDaysText}</p>}
  </div>;
}
