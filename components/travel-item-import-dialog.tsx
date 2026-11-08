"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Clipboard, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import {
  getFlightFormatPrompt,
  getHotelFormatPrompt,
  getTransportationFormatPrompt,
  getTravelImportPrompt,
  parseFlightImport,
  parseHotelImport,
  parseTransportationImport,
  parseTravelImport,
  type FlightImportItem,
  type HotelImportItem,
  type ImportPreview,
  type TransportationImportItem,
  type TravelImportItem,
  type TravelImportResult,
} from "@/lib/travel-import";
import { travelRepository } from "@/lib/travel-repository";
import {
  analyzeTravelUpdate,
  buildTravelUpdateOperations,
  buildTravelUpdatePatch,
  emptyProvidedFields,
  fieldLabel,
  type TravelUpdateAnalysisRow,
  type TravelUpdateResolution,
} from "@/lib/travel-update-import";
import type { TravelItem, Trip } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TravelImportMode = "itinerary" | "flight" | "hotel" | "transportation";
type ItineraryImportMode = "append" | "update";
type UpdateContext = { items: TravelItem[]; snapshotToken: string };

type PreviewState =
  | { mode: "itinerary"; value: ImportPreview<TravelImportItem> }
  | { mode: "flight"; value: ImportPreview<FlightImportItem> }
  | { mode: "hotel"; value: ImportPreview<HotelImportItem> }
  | { mode: "transportation"; value: ImportPreview<TransportationImportItem> };

const MODE_LABELS: Record<TravelImportMode, string> = {
  itinerary: "行程",
  flight: "機票",
  hotel: "飯店",
  transportation: "交通",
};

export function TravelItemImportAction({ onClick, className }: { onClick: () => void; className?: string }) {
  return <button type="button" aria-label="匯入" title="匯入" onClick={onClick} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-searchBackground hover:text-[#555555]", className)}><Upload className="h-4 w-4 stroke-[1.5]" /></button>;
}

export function TravelItemImportDialog({ open, trip, onOpenChange, onImported }: {
  open: boolean;
  trip: Trip;
  onOpenChange: (open: boolean) => void;
  onImported: (mode: TravelImportMode) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<TravelImportMode>("itinerary");
  const [itineraryMode, setItineraryMode] = useState<ItineraryImportMode>("update");
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<PreviewState>();
  const [updateContext, setUpdateContext] = useState<UpdateContext>();
  const [updateRows, setUpdateRows] = useState<TravelUpdateAnalysisRow[]>([]);
  const [resolutions, setResolutions] = useState<Map<number, TravelUpdateResolution>>(new Map());
  const [clearFields, setClearFields] = useState<Map<number, Set<string>>>(new Map());
  const [requestId, setRequestId] = useState("");
  const [result, setResult] = useState<TravelImportResult>();
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("itinerary");
    setItineraryMode("update");
    setSource("");
    setPreview(undefined);
    resetUpdateState();
    setResult(undefined);
    setParsing(false);
    setImporting(false);
  }, [open, trip.id, trip.mode]);

  const activePreview = preview?.mode === mode ? preview.value : undefined;
  const errorCount = useMemo(() => activePreview?.rows.filter((row) => row.errors.length > 0).length ?? 0, [activePreview]);
  const importableRows = useMemo(() => activePreview?.rows.filter((row) => row.errors.length === 0 && row.item) ?? [], [activePreview]);
  const safeResolutions = useMemo(() => withoutDuplicateTargets(resolutions), [resolutions]);
  const updateOperations = useMemo(() => updateContext
    ? buildTravelUpdateOperations(updateRows, updateContext.items, safeResolutions, clearFields, { allowUnscheduledAdds: trip.mode === "collection" })
    : [], [clearFields, safeResolutions, trip.mode, updateContext, updateRows]);
  const updatingItinerary = mode === "itinerary" && itineraryMode === "update";
  const canImport = updatingItinerary
    ? Boolean(activePreview && !activePreview.parseError && errorCount === 0 && updateContext && updateOperations.length > 0 && !result)
    : Boolean(activePreview && !activePreview.parseError && activePreview.rows.length > 0 && errorCount === 0 && importableRows.length === activePreview.rows.length && !result);

  const copyPrompt = async (prompt: string, label: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success(`已複製${label}格式提示`);
    } catch {
      toast.error("無法複製，請確認瀏覽器已允許剪貼簿權限");
    }
  };

  const changeMode = (nextMode: TravelImportMode) => {
    if (nextMode === mode || importing) return;
    setMode(nextMode);
    setSource("");
    setPreview(undefined);
    resetUpdateState();
    setResult(undefined);
  };

  const changeItineraryMode = (nextMode: ItineraryImportMode) => {
    if (nextMode === itineraryMode || importing) return;
    setItineraryMode(nextMode);
    setSource("");
    setPreview(undefined);
    resetUpdateState();
    setResult(undefined);
  };

  function resetUpdateState() {
    setUpdateContext(undefined);
    setUpdateRows([]);
    setResolutions(new Map());
    setClearFields(new Map());
    setRequestId("");
  }

  const parseSource = async () => {
    setResult(undefined);
    resetUpdateState();
    if (mode === "flight") {
      setPreview({ mode, value: parseFlightImport(source) });
    } else if (mode === "hotel") {
      setPreview({ mode, value: parseHotelImport(source) });
    } else if (mode === "transportation") {
      setPreview({ mode, value: parseTransportationImport(source) });
    } else {
      const updatingTrip = trip.mode === "trip" && itineraryMode === "update";
      const updatingCollection = trip.mode === "collection" && itineraryMode === "update";
      const nextPreview = parseTravelImport(source, trip, {
        allowUnscheduledTripDate: updatingTrip,
        collectionUpdateMode: updatingCollection,
        preserveOptionalTextWhitespace: updatingTrip || updatingCollection,
      });
      setPreview({ mode, value: nextPreview });
      if (itineraryMode === "update" && !nextPreview.parseError && nextPreview.rows.every((row) => row.errors.length === 0 && row.item)) {
        setParsing(true);
        try {
          const context = await travelRepository.prepareTravelItemsUpdate(trip.id);
          const rows = analyzeTravelUpdate(nextPreview, context.items, {
            allowUnscheduledAdds: trip.mode === "collection",
            requireCrossTypeNameConfirmation: trip.mode === "collection",
            workspaceLabel: trip.mode === "collection" ? "收藏" : "旅程",
          });
          setUpdateContext(context);
          setUpdateRows(rows);
          setResolutions(new Map(rows.map((row) => [row.index, row.defaultResolution])));
          setRequestId(crypto.randomUUID());
        } catch (error) {
          toast.error(errorMessage(error, trip.mode === "collection" ? "無法比對目前收藏" : "無法比對目前行程"));
        } finally {
          setParsing(false);
        }
      }
    }
  };

  const confirmImport = async () => {
    if (!canImport || !preview || preview.mode !== mode) return;
    setImporting(true);
    try {
      let nextResult: TravelImportResult;
      if (preview.mode === "flight") {
        nextResult = await travelRepository.importFlights(trip.id, preview.value.rows.flatMap((row) => row.item ? [row.item] : []));
      } else if (preview.mode === "hotel") {
        nextResult = await travelRepository.importHotelStays(trip.id, preview.value.rows.flatMap((row) => row.item ? [row.item] : []));
      } else if (preview.mode === "transportation") {
        nextResult = await travelRepository.importTransportations(trip.id, preview.value.rows.flatMap((row) => row.item ? [row.item] : []));
      } else if (updatingItinerary && updateContext) {
        nextResult = await travelRepository.updateTravelItems(trip.id, updateContext.snapshotToken, requestId, updateOperations);
      } else {
        nextResult = await travelRepository.importTravelItems(trip.id, preview.value.rows.flatMap((row) => row.item ? [row.item] : []));
      }
      setResult(nextResult);
      if (nextResult.successCount > 0) await onImported(preview.mode);
      if (nextResult.failureCount === 0) {
        toast.success(`匯入完成：成功 ${nextResult.successCount} 筆，失敗 0 筆`);
        onOpenChange(false);
      } else {
        toast.error(`匯入完成：成功 ${nextResult.successCount} 筆，失敗 ${nextResult.failureCount} 筆`);
      }
    } catch (error) {
      toast.error(errorMessage(error, "匯入失敗"));
    } finally {
      setImporting(false);
    }
  };

  return <Dialog open={open} onOpenChange={(next) => { if (!importing) onOpenChange(next); }}>
    <DialogContent title="匯入 TripGoGo JSON" titleClassName="!tracking-[0.04em]" className="max-h-[calc(100dvh-32px)] sm:max-w-3xl" preventOutsideDismiss>
      <div className="space-y-5">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted">貼上 ChatGPT 產生的 JSON，解析並確認預覽後才會寫入。</p>
          <div className="grid min-w-0 grid-cols-2 divide-x divide-divider overflow-hidden rounded-card border border-border text-[11px] text-muted">
            <div className="min-w-0 px-3 py-3 sm:px-4">
              <span className="flex min-w-0 items-center gap-2 whitespace-nowrap"><Clipboard className="hidden h-4 w-4 shrink-0 stroke-[1.5] sm:block" />複製 GPT 格式提示詞</span>
              {trip.mode === "trip" ? <span className="mt-2 flex min-w-0 flex-wrap items-center whitespace-nowrap">
                <span className="flex w-full min-w-0 items-center sm:w-auto"><PromptButton label="行程" onClick={() => copyPrompt(getTravelImportPrompt(trip), "行程")} /><PromptDivider /><PromptButton label="機票" onClick={() => copyPrompt(getFlightFormatPrompt(), "機票")} /><PromptDivider className="hidden sm:inline" /></span>
                <span className="flex w-full min-w-0 items-center sm:w-auto"><PromptButton label="飯店" onClick={() => copyPrompt(getHotelFormatPrompt(), "飯店")} /><PromptDivider /><PromptButton label="交通" onClick={() => copyPrompt(getTransportationFormatPrompt(), "交通")} /></span>
              </span> : <span className="mt-2 inline-flex min-w-0 items-center whitespace-nowrap"><PromptButton label="行程" onClick={() => copyPrompt(getTravelImportPrompt(trip), "行程")} /></span>}
            </div>
            <div className="min-w-0 px-3 py-3 sm:px-4">
              <span className="block whitespace-nowrap">匯入類型</span>
              {trip.mode === "trip" ? <span className="mt-2 flex min-w-0 flex-wrap items-center whitespace-nowrap">
                <span className="flex w-full min-w-0 items-center sm:w-auto"><ModeButton mode="itinerary" activeMode={mode} onClick={changeMode} disabled={importing} /><PromptDivider /><ModeButton mode="flight" activeMode={mode} onClick={changeMode} disabled={importing} /><PromptDivider className="hidden sm:inline" /></span>
                <span className="flex w-full min-w-0 items-center sm:w-auto"><ModeButton mode="hotel" activeMode={mode} onClick={changeMode} disabled={importing} /><PromptDivider /><ModeButton mode="transportation" activeMode={mode} onClick={changeMode} disabled={importing} /></span>
              </span> : <span className="mt-2 inline-flex min-w-0 items-center whitespace-nowrap"><ModeButton mode="itinerary" activeMode={mode} onClick={changeMode} disabled={importing} /></span>}
            </div>
          </div>
          {mode === "itinerary" && <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="shrink-0">匯入模式</span>
            <span className="inline-flex min-w-0 items-center whitespace-nowrap">
              <ItineraryModeButton value="append" activeValue={itineraryMode} onClick={changeItineraryMode} disabled={importing} />
              <PromptDivider />
              <ItineraryModeButton value="update" activeValue={itineraryMode} onClick={changeItineraryMode} disabled={importing} collection={trip.mode === "collection"} />
            </span>
          </div>}
        </div>

        <label className="block space-y-2 text-sm">
          <span className="font-medium">GPT JSON</span>
          <Textarea
            aria-label="GPT JSON"
            value={source}
            onChange={(event) => { setSource(event.target.value); setPreview(undefined); resetUpdateState(); setResult(undefined); }}
            rows={10}
            spellCheck={false}
            placeholder={placeholder(mode)}
            className="min-h-[220px] resize-y font-mono text-xs leading-5"
            disabled={importing || Boolean(result)}
          />
        </label>

        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={!source.trim() || parsing || importing || Boolean(result)} onClick={() => void parseSource()}>{parsing ? "比對中…" : "解析並預覽"}</Button>
        </div>

        {preview?.mode === mode && (updatingItinerary && updateContext
          ? <UpdatePreview
              rows={updateRows}
              existingItems={updateContext.items}
              resolutions={resolutions}
              clearFields={clearFields}
              collection={trip.mode === "collection"}
              onResolutionChange={(index, resolution) => setResolutions((current) => new Map(current).set(index, resolution))}
              onClearFieldChange={(index, field, checked) => setClearFields((current) => {
                const next = new Map(current);
                const fields = new Set(next.get(index) ?? []);
                if (checked) fields.add(field); else fields.delete(field);
                next.set(index, fields);
                return next;
              })}
            />
          : <Preview state={preview} errorCount={errorCount} />)}
        {result && <ImportResult result={result} />}

        <div className="flex justify-end gap-2 border-t border-divider pt-4">
          <Button type="button" variant="ghost" disabled={importing} onClick={() => onOpenChange(false)}>關閉</Button>
          <Button type="button" disabled={!canImport || importing} onClick={confirmImport}>{importing ? "匯入中…" : result ? "匯入完成" : "確認匯入"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function ItineraryModeButton({ value, activeValue, onClick, disabled, collection = false }: { value: ItineraryImportMode; activeValue: ItineraryImportMode; onClick: (value: ItineraryImportMode) => void; disabled: boolean; collection?: boolean }) {
  const active = value === activeValue;
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={() => onClick(value)} className={cn("border-b py-1 text-[#222222] transition-colors hover:text-[#555555]", active ? "border-ink font-medium" : "border-transparent")}>{value === "append" ? "新增匯入" : collection ? "更新收藏" : "更新行程"}</button>;
}

function PromptButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="py-1 text-[#222222] transition-colors hover:text-[#555555]">{label}</button>;
}

function PromptDivider({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("px-1 text-muted", className)}>｜</span>;
}

function ModeButton({ mode, activeMode, onClick, disabled }: { mode: TravelImportMode; activeMode: TravelImportMode; onClick: (mode: TravelImportMode) => void; disabled: boolean }) {
  const active = mode === activeMode;
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={() => onClick(mode)} className={cn("border-b py-1 text-[#222222] transition-colors hover:text-[#555555]", active ? "border-ink font-medium" : "border-transparent")}>{MODE_LABELS[mode]}</button>;
}

function Preview({ state, errorCount }: { state: PreviewState; errorCount: number }) {
  if (state.mode === "flight") {
    return <PreviewList preview={state.value} errorCount={errorCount} renderSummary={(item) => item ? <>
      <p className="truncate font-medium">{item.airline} · {item.flightNumber}</p>
      <p className="mt-1 truncate text-xs text-muted">{item.departurePlace} → {item.arrivalPlace}</p>
      <p className="mt-1 text-xs text-muted">{item.departureDate} {item.departureTime} → {item.arrivalDate} {item.arrivalTime}</p>
    </> : <p className="font-medium">無法辨識航班</p>} />;
  }
  if (state.mode === "hotel") {
    return <PreviewList preview={state.value} errorCount={errorCount} renderSummary={(item) => item ? <>
      <p className="truncate font-medium">{item.name}</p>
      <p className="mt-1 text-xs text-muted">Check-in {item.checkInDate}{item.checkInTime ? ` ${item.checkInTime}` : ""} · Check-out {item.checkOutDate}{item.checkOutTime ? ` ${item.checkOutTime}` : ""}</p>
      {item.address && <p className="mt-1 truncate text-xs text-muted">{item.address}</p>}
    </> : <p className="font-medium">無法辨識飯店</p>} />;
  }
  if (state.mode === "transportation") {
    return <PreviewList preview={state.value} errorCount={errorCount} renderSummary={(item) => item ? <>
      <p className="truncate font-medium">{item.type === "rental_car" ? `${item.company} · ${item.vehicleModel}` : `${item.routeName}${item.trainNumber ? ` · ${item.trainNumber}` : ""}`}</p>
      <p className="mt-1 truncate text-xs text-muted">{item.departurePlace} → {item.arrivalPlace}</p>
      <p className="mt-1 text-xs text-muted">{item.startDate} {item.startTime} → {item.endDate} {item.endTime}</p>
    </> : <p className="font-medium">無法辨識交通</p>} />;
  }
  return <PreviewList preview={state.value} errorCount={errorCount} renderSummary={(item) => item ? <>
    <p className="truncate font-medium">{item.name}</p>
    <p className="mt-1 text-xs text-muted">{item.type === "place" ? "景點" : "美食"}{item.date ? ` · ${item.date}` : item.status ? ` · ${item.status}` : ""}</p>
    {item.priceList && <p className="mt-1 truncate text-xs text-muted">含價目表{item.priceCheckedAt ? ` · ${item.priceCheckedAt}` : ""}</p>}
  </> : <p className="font-medium">無法辨識名稱</p>} />;
}

function PreviewList<T>({ preview, errorCount, renderSummary }: { preview: ImportPreview<T>; errorCount: number; renderSummary: (item: T | undefined) => ReactNode }) {
  if (preview.parseError) return <div role="alert" className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{preview.parseError}</div>;
  const importableCount = preview.rows.length - errorCount;
  return <section aria-label="匯入預覽" className="space-y-3">
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <span>共 {preview.rows.length} 筆</span>
      <span className="text-muted">可匯入 {importableCount} 筆</span>
      <span className={errorCount ? "text-red-600" : "text-muted"}>{errorCount} 筆需處理</span>
    </div>
    <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
      {preview.rows.map((row) => <article key={row.index} className="rounded-card border border-border bg-bg px-3 py-3 text-sm">
        <div className="flex min-w-0 items-start gap-3">
          <span className="shrink-0 pt-0.5 text-xs text-muted">#{row.index + 1}</span>
          <div className="min-w-0 flex-1">{renderSummary(row.item)}</div>
          <span className={`shrink-0 pt-0.5 text-xs ${row.errors.length ? "text-red-600" : "text-muted"}`}>{row.errors.length ? "需處理" : "正常"}</span>
        </div>
        {row.errors.length > 0 && <ul className="mt-2 space-y-1 border-t border-divider pt-2 text-xs leading-5 text-red-700">{row.errors.map((error) => <li key={error}>• {error}</li>)}</ul>}
      </article>)}
    </div>
    {errorCount > 0 && <p className="text-xs leading-5 text-red-700">請回到上方 JSON 修正所有錯誤並重新解析，才能確認匯入。</p>}
  </section>;
}

function UpdatePreview({ rows, existingItems, resolutions, clearFields, collection, onResolutionChange, onClearFieldChange }: {
  rows: TravelUpdateAnalysisRow[];
  existingItems: TravelItem[];
  resolutions: ReadonlyMap<number, TravelUpdateResolution>;
  clearFields: ReadonlyMap<number, ReadonlySet<string>>;
  collection: boolean;
  onResolutionChange: (index: number, resolution: TravelUpdateResolution) => void;
  onClearFieldChange: (index: number, field: string, checked: boolean) => void;
}) {
  const duplicateTargets = duplicateTargetIds(resolutions);
  const summaries = rows.map((row) => summarizeUpdateRow(row, existingItems, resolutions.get(row.index) ?? row.defaultResolution, clearFields.get(row.index) ?? new Set(), duplicateTargets));
  const count = (status: UpdateRowSummary["status"]) => summaries.filter((summary) => summary.status === status).length;
  const sortedItems = [...existingItems].sort((a, b) => collection
    ? a.order - b.order || a.createdAt.localeCompare(b.createdAt)
    : a.date?.localeCompare(b.date ?? "") || a.name.localeCompare(b.name));

  return <section aria-label={collection ? "更新收藏預覽" : "更新行程預覽"} className="space-y-3">
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm">
      <span>新增 {count("add")}</span>
      <span>更新 {count("update")}</span>
      <span>移動日期 {count("move")}</span>
      <span className="text-muted">不變 {count("unchanged")}</span>
      <span className={count("pending") ? "text-red-600" : "text-muted"}>待手動確認 {count("pending")}</span>
      <span className="text-muted">略過 {count("skip")}</span>
    </div>
    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
      {summaries.map(({ row, resolution, status, label, existing, diffs, duplicateTarget }) => {
        const emptyFields = emptyProvidedFields(row);
        return <article key={row.index} className="rounded-card border border-border bg-bg px-3 py-3 text-sm">
          <div className="flex min-w-0 items-start gap-3">
            <span className="shrink-0 pt-0.5 text-xs text-muted">#{row.index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.item.name}</p>
              <p className="mt-1 text-xs text-muted">{row.item.type === "place" ? "景點" : "美食"} · {collection ? row.item.status === "completed" ? "已完成" : "計畫中" : row.item.date ?? "未定"}</p>
            </div>
            <span className={cn("shrink-0 pt-0.5 text-xs", status === "pending" || duplicateTarget ? "text-red-600" : "text-muted")}>{label}</span>
          </div>

          {row.requiresManualMatch && <div className="mt-3 space-y-2 border-t border-divider pt-3">
            <p className="text-xs leading-5 text-red-700">{row.reason}；未確認時預設略過。</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={sortedItems.length === 0} onClick={() => {
                const firstId = row.suggestedIds[0] ?? sortedItems[0]?.id;
                if (firstId) onResolutionChange(row.index, { kind: "update", existingId: firstId, confirmed: true });
              }} className={choiceClass(resolution.kind === "update")}>指定既有項目</button>
              <button type="button" disabled={!collection && row.item.date === null} title={!collection && row.item.date === null ? "未排日期項目需先由 GPT 補上日期，才能視為新增" : undefined} onClick={() => onResolutionChange(row.index, { kind: "add", confirmed: true })} className={choiceClass(resolution.kind === "add")}>視為新增</button>
              <button type="button" onClick={() => onResolutionChange(row.index, { kind: "skip", confirmed: true })} className={choiceClass(resolution.kind === "skip" && resolution.confirmed)}>略過此筆</button>
            </div>
            {!collection && row.item.date === null && <p className="text-xs leading-5 text-muted">JSON 的 date: null 會保留既有日期；未補上有效日期前不能視為新增。</p>}
            {resolution.kind === "update" && <select
              aria-label={`指定「${row.item.name}」對應的既有項目`}
              value={resolution.existingId}
              onChange={(event) => onResolutionChange(row.index, { kind: "update", existingId: event.target.value, confirmed: true })}
              className="form-control h-10 w-full rounded-input border border-border bg-surface px-3 text-xs text-ink outline-none focus:border-muted"
            >
              {sortedItems.map((item) => <option key={item.id} value={item.id}>{item.name}｜{item.type === "place" ? "景點" : "美食"}｜{collection ? item.status === "completed" ? "已完成" : "計畫中" : item.date ?? "未定"}｜{item.area || "未分類"}</option>)}
            </select>}
            {duplicateTarget && <p className="text-xs text-red-700">同一既有項目被指定超過一次；這些重複指定會安全略過，其他項目仍可匯入。</p>}
          </div>}

          {existing && diffs.length > 0 && !duplicateTarget && <ul className="mt-3 space-y-1 border-t border-divider pt-2 text-xs leading-5 text-muted">
            {diffs.map((diff) => <li key={diff.field}><span className="text-ink">{diff.label}</span>：{diff.before} → {diff.after}</li>)}
          </ul>}
          {existing && emptyFields.length > 0 && resolution.kind === "update" && !duplicateTarget && <div className="mt-3 border-t border-divider pt-2">
            <p className="text-xs leading-5 text-muted">JSON 的空字串或 null 預設保留原值；只有勾選後才會清除。</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {emptyFields.map(({ field, sourceKind }) => <label key={field} className="inline-flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={clearFields.get(row.index)?.has(field) ?? false} onChange={(event) => onClearFieldChange(row.index, field, event.target.checked)} className="form-control h-3.5 w-3.5 accent-ink" />
                清除{fieldLabel(field)}（JSON {sourceKind === "null" ? "null" : "空字串"}）
              </label>)}
            </div>
          </div>}
        </article>;
      })}
    </div>
    <p className="text-xs leading-5 text-muted">{collection ? "未出現在 JSON 的既有收藏不會變更。更新項目保留原排序；新增項目追加至收藏末尾。date 永遠維持 null，實際造訪日期使用 completedDate。" : "未出現在 JSON 的既有項目不會變更。日期未改變的項目保留原排序；移動日期與新增項目才會追加至目標日期末尾。"}</p>
  </section>;
}

type UpdateRowSummary = {
  row: TravelUpdateAnalysisRow;
  resolution: TravelUpdateResolution;
  status: "add" | "update" | "move" | "unchanged" | "pending" | "skip";
  label: string;
  existing?: TravelItem;
  diffs: ReturnType<typeof buildTravelUpdatePatch>["diffs"];
  duplicateTarget: boolean;
};

function summarizeUpdateRow(row: TravelUpdateAnalysisRow, existingItems: TravelItem[], resolution: TravelUpdateResolution, clearFields: ReadonlySet<string>, duplicateTargets: ReadonlySet<string>): UpdateRowSummary {
  if (resolution.kind === "skip") {
    return { row, resolution, status: resolution.confirmed ? "skip" : "pending", label: resolution.confirmed ? "略過" : "待手動確認", diffs: [], duplicateTarget: false };
  }
  if (resolution.kind === "add") {
    return { row, resolution, status: "add", label: "新增", diffs: [], duplicateTarget: false };
  }
  const existing = existingItems.find((item) => item.id === resolution.existingId);
  const duplicateTarget = duplicateTargets.has(resolution.existingId);
  if (!existing || duplicateTarget) {
    return { row, resolution, status: "pending", label: duplicateTarget ? "重複指定" : "待手動確認", existing, diffs: [], duplicateTarget };
  }
  const { diffs, movedDate } = buildTravelUpdatePatch(row, existing, clearFields);
  if (diffs.length === 0) return { row, resolution, status: "unchanged", label: "不變", existing, diffs, duplicateTarget: false };
  return { row, resolution, status: movedDate ? "move" : "update", label: movedDate ? "移動日期" : "更新內容", existing, diffs, duplicateTarget: false };
}

function choiceClass(active: boolean) {
  return cn("rounded-tag border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40", active ? "border-ink bg-surface text-ink" : "border-border bg-transparent text-muted hover:text-ink");
}

function duplicateTargetIds(resolutions: ReadonlyMap<number, TravelUpdateResolution>) {
  const counts = new Map<string, number>();
  for (const resolution of resolutions.values()) {
    if (resolution.kind === "update") counts.set(resolution.existingId, (counts.get(resolution.existingId) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
}

function withoutDuplicateTargets(resolutions: ReadonlyMap<number, TravelUpdateResolution>) {
  const duplicates = duplicateTargetIds(resolutions);
  if (duplicates.size === 0) return resolutions;
  return new Map([...resolutions].map(([index, resolution]) => resolution.kind === "update" && duplicates.has(resolution.existingId)
    ? [index, { kind: "skip", confirmed: false } satisfies TravelUpdateResolution]
    : [index, resolution]));
}

function ImportResult({ result }: { result: TravelImportResult }) {
  return <section aria-live="polite" className="rounded-card border border-border bg-bg px-4 py-3 text-sm">
    <p>成功 {result.successCount} 筆，失敗 {result.failureCount} 筆</p>
    {result.failures.length > 0 && <ul className="mt-2 space-y-1 text-xs leading-5 text-red-700">{result.failures.map((failure) => <li key={`${failure.index}-${failure.message}`}>#{failure.index + 1}：{failure.message}</li>)}</ul>}
  </section>;
}

function placeholder(mode: TravelImportMode) {
  if (mode === "flight") return '[{ "airline": "航空公司", "flightNumber": "航班編號", "departurePlace": "出發地", "arrivalPlace": "抵達地" }]';
  if (mode === "hotel") return '[{ "name": "飯店名稱", "checkInDate": "YYYY-MM-DD", "checkOutDate": "YYYY-MM-DD" }]';
  if (mode === "transportation") return '[{ "type": "rail", "routeName": "路線名稱", "startDate": "YYYY-MM-DD", "startTime": "HH:mm", "endDate": "YYYY-MM-DD", "endTime": "HH:mm", "departurePlace": "出發站", "arrivalPlace": "抵達站" }]';
  return '[{ "type": "place", "name": "景點名稱" }]';
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
