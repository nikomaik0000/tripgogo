"use client";

import { ClipboardCopy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createTravelJsonExport, travelJsonFilename } from "@/lib/travel-json-export";
import { cn } from "@/lib/utils";
import type { TravelItem, Trip } from "@/lib/types";

export function TravelItemExportAction({ onClick, className }: { onClick: () => void; className?: string }) {
  return <button type="button" aria-label="匯出 JSON" title="匯出 JSON" onClick={onClick} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-card text-muted hover:bg-searchBackground hover:text-[#555555]", className)}><Download className="h-4 w-4 stroke-[1.5]" /></button>;
}

export function TravelItemExportDialog({ open, trip, items, onOpenChange }: {
  open: boolean;
  trip: Trip;
  items: TravelItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const result = createTravelJsonExport(trip, items);
  const canExport = Boolean(result.json);
  const collection = trip.mode === "collection";
  const workspaceLabel = collection ? "收藏" : "行程";

  const copyJson = async () => {
    if (!result.json) return;
    try {
      await navigator.clipboard.writeText(result.json);
      toast.success(`已複製${workspaceLabel} JSON`);
    } catch {
      toast.error("無法複製，請確認瀏覽器已允許剪貼簿權限");
    }
  };

  const downloadJson = () => {
    if (!result.json) return;
    const url = URL.createObjectURL(new Blob([result.json], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = travelJsonFilename(trip.name);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success(`已下載${workspaceLabel} JSON`);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="匯出 TripGoGo JSON" className="max-h-[calc(100dvh-32px)]">
      <div className="space-y-4 text-sm text-muted">
        {result.items.length === 0 ? <p>目前{workspaceLabel}尚無可匯出的地點或美食。</p> : <p>{collection ? "將依收藏原有順序" : "將依每日行程順序"}匯出目前{workspaceLabel}的地點與美食，共 {result.items.length} 筆。</p>}

        {result.issues.length > 0 && <section className="space-y-2 rounded-card border border-border bg-searchBackground px-4 py-3" aria-label="無法匯出的資料">
          <p className="font-medium text-ink">請先修正以下資料，才能產生可重新匯入的 JSON：</p>
          <ul className="max-h-48 space-y-2 overflow-y-auto text-xs leading-relaxed">
            {result.issues.map((issue, index) => <li key={`${index}-${issue.name}`} className="break-words"><span className="font-medium text-ink">{issue.name}</span>：{issue.messages.join("；")}</li>)}
          </ul>
        </section>}

        {result.duplicates.length > 0 && <section className="space-y-1 rounded-card border border-border px-4 py-3 text-xs leading-relaxed">
          <p className="font-medium text-ink">同名項目提醒</p>
          <p>以下同名同類型項目可正常匯出，但使用「{collection ? "更新收藏" : "更新行程"}」匯回時可能需要手動配對：</p>
          <p className="break-words">{result.duplicates.map((duplicate) => `${duplicate.type === "food" ? "美食" : "地點"}「${duplicate.name}」× ${duplicate.count}`).join("、")}</p>
        </section>}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
        <Button type="button" variant="ghost" disabled={!canExport} onClick={() => void copyJson()}><ClipboardCopy className="h-4 w-4" />複製 JSON</Button>
        <Button type="button" disabled={!canExport} onClick={downloadJson}><Download className="h-4 w-4" />下載 JSON</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
