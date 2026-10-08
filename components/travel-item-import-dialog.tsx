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
  getTravelImportPrompt,
  parseFlightImport,
  parseHotelImport,
  parseTravelImport,
  type FlightImportItem,
  type HotelImportItem,
  type ImportPreview,
  type TravelImportItem,
  type TravelImportResult,
} from "@/lib/travel-import";
import { travelRepository } from "@/lib/travel-repository";
import type { Trip } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TravelImportMode = "itinerary" | "flight" | "hotel";

type PreviewState =
  | { mode: "itinerary"; value: ImportPreview<TravelImportItem> }
  | { mode: "flight"; value: ImportPreview<FlightImportItem> }
  | { mode: "hotel"; value: ImportPreview<HotelImportItem> };

const MODE_LABELS: Record<TravelImportMode, string> = {
  itinerary: "行程",
  flight: "機票",
  hotel: "飯店",
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
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<PreviewState>();
  const [result, setResult] = useState<TravelImportResult>();
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("itinerary");
    setSource("");
    setPreview(undefined);
    setResult(undefined);
    setImporting(false);
  }, [open, trip.id]);

  const activePreview = preview?.mode === mode ? preview.value : undefined;
  const errorCount = useMemo(() => activePreview?.rows.filter((row) => row.errors.length > 0).length ?? 0, [activePreview]);
  const importableRows = useMemo(() => activePreview?.rows.filter((row) => row.errors.length === 0 && row.item) ?? [], [activePreview]);
  const canImport = Boolean(activePreview && !activePreview.parseError && activePreview.rows.length > 0 && errorCount === 0 && importableRows.length === activePreview.rows.length && !result);

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
    setResult(undefined);
  };

  const parseSource = () => {
    setResult(undefined);
    if (mode === "flight") {
      setPreview({ mode, value: parseFlightImport(source) });
    } else if (mode === "hotel") {
      setPreview({ mode, value: parseHotelImport(source) });
    } else {
      setPreview({ mode, value: parseTravelImport(source, trip) });
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
    <DialogContent title="匯入 TripGoGo JSON" className="max-h-[calc(100dvh-32px)] sm:max-w-3xl" preventOutsideDismiss>
      <div className="space-y-5">
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted">貼上 ChatGPT 產生的 JSON，解析並確認預覽後才會寫入。</p>
          <div className="grid min-w-0 grid-cols-2 divide-x divide-divider overflow-hidden rounded-card border border-border text-[11px] text-muted">
            <div className="min-w-0 px-3 py-3 sm:px-4">
              <span className="flex min-w-0 items-center gap-2 whitespace-nowrap"><Clipboard className="hidden h-4 w-4 shrink-0 stroke-[1.5] sm:block" />複製 GPT 格式提示詞</span>
              <span className="mt-2 inline-flex min-w-0 items-center whitespace-nowrap">
                <PromptButton label="行程" onClick={() => copyPrompt(getTravelImportPrompt(trip), "行程")} />
                {trip.mode === "trip" && <><PromptDivider /><PromptButton label="機票" onClick={() => copyPrompt(getFlightFormatPrompt(), "機票")} /><PromptDivider /><PromptButton label="飯店" onClick={() => copyPrompt(getHotelFormatPrompt(), "飯店")} /></>}
              </span>
            </div>
            <div className="min-w-0 px-3 py-3 sm:px-4">
              <span className="block whitespace-nowrap">匯入類型</span>
              <span className="mt-2 inline-flex min-w-0 items-center whitespace-nowrap">
                <ModeButton mode="itinerary" activeMode={mode} onClick={changeMode} disabled={importing} />
                {trip.mode === "trip" && <><PromptDivider /><ModeButton mode="flight" activeMode={mode} onClick={changeMode} disabled={importing} /><PromptDivider /><ModeButton mode="hotel" activeMode={mode} onClick={changeMode} disabled={importing} /></>}
              </span>
            </div>
          </div>
        </div>

        <label className="block space-y-2 text-sm">
          <span className="font-medium">GPT JSON</span>
          <Textarea
            aria-label="GPT JSON"
            value={source}
            onChange={(event) => { setSource(event.target.value); setPreview(undefined); setResult(undefined); }}
            rows={10}
            spellCheck={false}
            placeholder={placeholder(mode)}
            className="min-h-[220px] resize-y font-mono text-xs leading-5"
            disabled={importing || Boolean(result)}
          />
        </label>

        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={!source.trim() || importing || Boolean(result)} onClick={parseSource}>解析並預覽</Button>
        </div>

        {preview?.mode === mode && <Preview state={preview} errorCount={errorCount} />}
        {result && <ImportResult result={result} />}

        <div className="flex justify-end gap-2 border-t border-divider pt-4">
          <Button type="button" variant="ghost" disabled={importing} onClick={() => onOpenChange(false)}>關閉</Button>
          <Button type="button" disabled={!canImport || importing} onClick={confirmImport}>{importing ? "匯入中…" : result ? "匯入完成" : "確認匯入"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function PromptButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="py-1 text-[#222222] transition-colors hover:text-[#555555]">{label}</button>;
}

function PromptDivider() {
  return <span aria-hidden="true" className="px-1 text-muted">｜</span>;
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
  return <PreviewList preview={state.value} errorCount={errorCount} renderSummary={(item) => item ? <>
    <p className="truncate font-medium">{item.name}</p>
    <p className="mt-1 text-xs text-muted">{item.type === "place" ? "景點" : "美食"}{item.date ? ` · ${item.date}` : item.status ? ` · ${item.status}` : ""}</p>
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

function ImportResult({ result }: { result: TravelImportResult }) {
  return <section aria-live="polite" className="rounded-card border border-border bg-bg px-4 py-3 text-sm">
    <p>成功 {result.successCount} 筆，失敗 {result.failureCount} 筆</p>
    {result.failures.length > 0 && <ul className="mt-2 space-y-1 text-xs leading-5 text-red-700">{result.failures.map((failure) => <li key={`${failure.index}-${failure.message}`}>#{failure.index + 1}：{failure.message}</li>)}</ul>}
  </section>;
}

function placeholder(mode: TravelImportMode) {
  if (mode === "flight") return '[{ "airline": "航空公司", "flightNumber": "航班編號", "departurePlace": "出發地", "arrivalPlace": "抵達地" }]';
  if (mode === "hotel") return '[{ "name": "飯店名稱", "checkInDate": "YYYY-MM-DD", "checkOutDate": "YYYY-MM-DD" }]';
  return '[{ "type": "place", "name": "景點名稱" }]';
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
