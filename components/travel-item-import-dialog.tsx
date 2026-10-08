"use client";

import { useEffect, useMemo, useState } from "react";
import { Clipboard, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { getTravelImportPrompt, parseTravelImport, type TravelImportPreview, type TravelImportResult } from "@/lib/travel-import";
import { travelRepository } from "@/lib/travel-repository";
import type { Trip } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TravelItemImportAction({ onClick, className }: { onClick: () => void; className?: string }) {
  return <button type="button" aria-label="匯入" title="匯入" onClick={onClick} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-searchBackground hover:text-[#555555]", className)}><Upload className="h-4 w-4 stroke-[1.5]" /></button>;
}

export function TravelItemImportDialog({ open, trip, onOpenChange, onImported }: {
  open: boolean;
  trip: Trip;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void>;
}) {
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<TravelImportPreview>();
  const [result, setResult] = useState<TravelImportResult>();
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSource("");
    setPreview(undefined);
    setResult(undefined);
    setImporting(false);
  }, [open, trip.id]);

  const errorCount = useMemo(() => preview?.rows.filter((row) => row.errors.length > 0).length ?? 0, [preview]);
  const importableRows = useMemo(() => preview?.rows.filter((row) => row.errors.length === 0 && row.item) ?? [], [preview]);
  const canImport = Boolean(preview && !preview.parseError && preview.rows.length > 0 && errorCount === 0 && importableRows.length === preview.rows.length && !result);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(getTravelImportPrompt(trip));
      toast.success("已複製 GPT 格式提示");
    } catch {
      toast.error("無法複製，請確認瀏覽器已允許剪貼簿權限");
    }
  };

  const confirmImport = async () => {
    if (!canImport || !preview) return;
    const items = preview.rows.flatMap((row) => row.item ? [row.item] : []);
    setImporting(true);
    try {
      const nextResult = await travelRepository.importTravelItems(trip.id, items);
      setResult(nextResult);
      if (nextResult.successCount > 0) await onImported();
      if (nextResult.failureCount === 0) {
        toast.success(`已匯入 ${nextResult.successCount} 筆`);
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm leading-6 text-muted">貼上 ChatGPT 產生的 JSON，解析並確認預覽後才會寫入。</p>
          <Button type="button" size="sm" variant="ghost" onClick={copyPrompt} className="shrink-0 px-2 tracking-normal text-muted"><Clipboard className="h-4 w-4 stroke-[1.5]" />複製 GPT 格式提示</Button>
        </div>

        <label className="block space-y-2 text-sm">
          <span className="font-medium">GPT JSON</span>
          <Textarea
            aria-label="GPT JSON"
            value={source}
            onChange={(event) => { setSource(event.target.value); setPreview(undefined); setResult(undefined); }}
            rows={10}
            spellCheck={false}
            placeholder='[{ "type": "place", "name": "景點名稱" }]'
            className="min-h-[220px] resize-y font-mono text-xs leading-5"
            disabled={importing || Boolean(result)}
          />
        </label>

        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={!source.trim() || importing || Boolean(result)} onClick={() => setPreview(parseTravelImport(source, trip))}>解析並預覽</Button>
        </div>

        {preview && <Preview preview={preview} errorCount={errorCount} />}
        {result && <ImportResult result={result} />}

        <div className="flex justify-end gap-2 border-t border-divider pt-4">
          <Button type="button" variant="ghost" disabled={importing} onClick={() => onOpenChange(false)}>關閉</Button>
          <Button type="button" disabled={!canImport || importing} onClick={confirmImport}>{importing ? "匯入中…" : result ? "匯入完成" : "確認匯入"}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function Preview({ preview, errorCount }: { preview: TravelImportPreview; errorCount: number }) {
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
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-xs text-muted">#{row.index + 1}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{row.item?.name || "無法辨識名稱"}</span>
          {row.item && <span className="shrink-0 text-xs text-muted">{row.item.type === "place" ? "景點" : "美食"}{row.item.date ? ` · ${row.item.date}` : row.item.status ? ` · ${row.item.status}` : ""}</span>}
          <span className={`shrink-0 text-xs ${row.errors.length ? "text-red-600" : "text-muted"}`}>{row.errors.length ? "需處理" : "正常"}</span>
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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
