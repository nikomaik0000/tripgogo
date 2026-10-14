"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  BatchManagementDialogShell,
  BatchOperationResultSummary,
  type BatchManagementIssue,
  type BatchManagementShellRow,
} from "@/components/batch-management-dialog-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { travelRepository } from "@/lib/travel-repository";
import type { Trip, TripMode, TripResource, TripResourceCategory } from "@/lib/types";

type ResourceTabSets = Record<TripResourceCategory, Set<string>>;

type ResourceBatchRow = BatchManagementShellRow & {
  label: string;
  resource: TripResource;
};

type ResourceBatchResult =
  | { operation: "delete"; successCount: number; failures: BatchManagementIssue[] }
  | { operation: "copy"; successCount: number; failures: BatchManagementIssue[] };

const TRIP_TABS: TripResourceCategory[] = ["transportation", "coupon", "note"];
const COLLECTION_TABS: TripResourceCategory[] = ["note", "coupon", "transportation"];
const TAB_LABELS: Record<TripResourceCategory, string> = {
  transportation: "交通",
  coupon: "優惠券",
  note: "備忘",
};

function emptyTabSets(): ResourceTabSets {
  return {
    transportation: new Set(),
    coupon: new Set(),
    note: new Set(),
  };
}

export function ResourceBatchManagementAction({ onClick }: { onClick: () => void }) {
  return <button type="button" aria-label="批次管理" title="批次管理" onClick={onClick} className="flex h-10 w-10 shrink-0 items-center justify-center border-0 bg-transparent text-muted shadow-none transition-colors hover:bg-transparent hover:text-[#555555] sm:h-9 sm:w-9"><ListChecks className="h-4 w-4 stroke-[1.5]" /></button>;
}

export function ResourceBatchManagementDialog({ open, mode, sourceTripId, resources, onOpenChange, onRefresh }: {
  open: boolean;
  mode: TripMode;
  sourceTripId: string;
  resources: TripResource[];
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const tabs = mode === "trip" ? TRIP_TABS : COLLECTION_TABS;
  const initialTab = tabs[0];
  const [activeTab, setActiveTab] = useState<TripResourceCategory>(initialTab);
  const [selected, setSelected] = useState<ResourceTabSets>(emptyTabSets);
  const [deleted, setDeleted] = useState<ResourceTabSets>(emptyTabSets);
  const [editableTrips, setEditableTrips] = useState<Trip[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [targetTripIds, setTargetTripIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [batchResult, setBatchResult] = useState<ResourceBatchResult>();
  const busy = deleting || copying;

  useEffect(() => {
    if (open) return;
    setActiveTab(initialTab);
    setSelected(emptyTabSets());
    setDeleted(emptyTabSets());
    setDeleteConfirmOpen(false);
    setCopyOpen(false);
    setTargetTripIds(new Set());
    setBatchResult(undefined);
  }, [initialTab, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setTargetsLoading(true);
    setEditableTrips([]);
    travelRepository.getEditableTrips()
      .then((trips) => {
        if (active) setEditableTrips(trips.filter((trip) => trip.id !== sourceTripId));
      })
      .catch((error) => {
        if (active) toast.error(errorMessage(error, "無法載入可編輯旅遊"));
      })
      .finally(() => {
        if (active) setTargetsLoading(false);
      });
    return () => { active = false; };
  }, [open, sourceTripId]);

  const rowsByTab = useMemo<Record<TripResourceCategory, ResourceBatchRow[]>>(() => ({
    transportation: resources.filter((resource) => resource.category === "transportation" && !deleted.transportation.has(resource.id)).map(resourceRow),
    coupon: resources.filter((resource) => resource.category === "coupon" && !deleted.coupon.has(resource.id)).map(resourceRow),
    note: resources.filter((resource) => resource.category === "note" && !deleted.note.has(resource.id)).map(resourceRow),
  }), [deleted, resources]);

  const activeRows = rowsByTab[activeTab];
  const selectedCount = tabs.reduce((count, tab) => count + selected[tab].size, 0);
  const selectedRows = () => tabs.flatMap((tab) => rowsByTab[tab]
    .filter((row) => selected[tab].has(row.id))
    .map((row) => ({ tab, row })));
  const copyUnavailable = targetsLoading || editableTrips.length === 0;

  const setTabSelection = (tab: TripResourceCategory, ids: Set<string>) => {
    setSelected((current) => ({ ...current, [tab]: ids }));
  };

  const toggleRow = (tab: TripResourceCategory, id: string, checked: boolean) => {
    const next = new Set(selected[tab]);
    if (checked) next.add(id);
    else next.delete(id);
    setTabSelection(tab, next);
  };

  const deleteSelected = async () => {
    if (busy || selectedCount === 0) return;
    const entries = selectedRows();
    const failures: BatchManagementIssue[] = [];
    let successCount = 0;

    setDeleteConfirmOpen(false);
    setDeleting(true);
    setBatchResult(undefined);

    for (const [index, entry] of entries.entries()) {
      try {
        await travelRepository.deleteTripResource(entry.row.resource.id);
        successCount += 1;
        setSelected((current) => {
          const next = new Set(current[entry.tab]);
          next.delete(entry.row.id);
          return { ...current, [entry.tab]: next };
        });
        setDeleted((current) => {
          const next = new Set(current[entry.tab]);
          next.add(entry.row.id);
          return { ...current, [entry.tab]: next };
        });
      } catch (error) {
        failures.push({ index: index + 1, label: entry.row.label, message: errorMessage(error, "刪除失敗") });
      }
    }

    if (successCount > 0) {
      try {
        await onRefresh();
      } catch (error) {
        toast.error(errorMessage(error, "刪除完成，但重新載入失敗"));
      }
    }
    setBatchResult({ operation: "delete", successCount, failures });
    setDeleting(false);
  };

  const copySelected = async () => {
    if (busy || selectedCount === 0 || targetTripIds.size === 0) return;
    const entries = selectedRows();
    const targets = editableTrips.filter((trip) => targetTripIds.has(trip.id));
    const failures: BatchManagementIssue[] = [];
    let successCount = 0;
    let operationIndex = 0;

    setCopying(true);
    setBatchResult(undefined);

    for (const entry of entries) {
      for (const target of targets) {
        operationIndex += 1;
        try {
          await travelRepository.copyTripResourceToTrip(entry.row.resource, target.id);
          successCount += 1;
        } catch (error) {
          failures.push({
            index: operationIndex,
            label: `${entry.row.label} → ${target.name}`,
            message: errorMessage(error, "複製失敗"),
          });
        }
      }
    }

    setBatchResult({ operation: "copy", successCount, failures });
    setCopying(false);
    setCopyOpen(false);
  };

  const openCopyDialog = () => {
    if (copyUnavailable || selectedCount === 0) return;
    setTargetTripIds(new Set());
    setCopyOpen(true);
  };

  return <>
    <BatchManagementDialogShell
      open={open}
      tabs={tabs.map((tab) => ({ value: tab, label: TAB_LABELS[tab] }))}
      activeTab={activeTab}
      rows={activeRows}
      selectedIds={selected[activeTab]}
      selectedCount={selectedCount}
      busy={busy}
      emptyLabel={`沒有可管理的${TAB_LABELS[activeTab]}`}
      result={batchResult ? <ResourceBatchResultSummary result={batchResult} /> : undefined}
      stackFooterOnMobile
      footerActions={<div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-end">
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
        <span className="min-w-0" title={!targetsLoading && editableTrips.length === 0 ? "沒有其他可編輯旅遊" : undefined}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={!targetsLoading && editableTrips.length === 0 ? "複製到旅遊：沒有其他可編輯旅遊" : "複製到旅遊"}
            disabled={busy || selectedCount === 0 || copyUnavailable}
            onClick={openCopyDialog}
            className="w-full min-w-0 px-2 sm:px-3"
          >複製到旅遊</Button>
        </span>
        <Button type="button" size="sm" variant="destructive" disabled={busy || selectedCount === 0} onClick={() => setDeleteConfirmOpen(true)}>{deleting ? "刪除中…" : `刪除 ${selectedCount} 筆`}</Button>
      </div>}
      onOpenChange={onOpenChange}
      onTabChange={setActiveTab}
      onToggleRow={(id, checked) => toggleRow(activeTab, id, checked)}
      onSelectAll={() => setTabSelection(activeTab, new Set(activeRows.map((row) => row.id)))}
      onClearSelection={() => setTabSelection(activeTab, new Set())}
    />

    <Dialog open={deleteConfirmOpen} onOpenChange={(next) => { if (!busy) setDeleteConfirmOpen(next); }}>
      <DialogContent title="確認批次刪除" preventOutsideDismiss={busy} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
        <div className="space-y-2 text-sm text-muted">
          <p>確定刪除已選的 {selectedCount} 筆資料嗎？</p>
          <p>此操作無法復原。圖片檔案將保留，避免影響其他複本。</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
          <Button type="button" variant="destructive" disabled={busy || selectedCount === 0} onClick={() => void deleteSelected()}>{deleting ? "刪除中…" : `刪除 ${selectedCount} 筆`}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={copyOpen} onOpenChange={(next) => { if (!copying) setCopyOpen(next); }}>
      <DialogContent title="複製到旅遊" preventOutsideDismiss={copying} onEscapeKeyDown={(event) => { if (copying) event.preventDefault(); }} className="max-h-[calc(100dvh-2rem)] overflow-hidden">
        <div className="flex min-h-0 flex-col gap-4">
          <p className="text-sm text-muted">選擇一個或多個目標旅遊。每個目標都會建立獨立資料。</p>
          <div className="max-h-[min(50dvh,360px)] min-h-0 overflow-x-hidden overflow-y-auto rounded-card border border-border">
            {editableTrips.map((trip) => <label key={trip.id} className="flex min-w-0 cursor-pointer items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0">
              <input
                type="checkbox"
                checked={targetTripIds.has(trip.id)}
                disabled={copying}
                onChange={(event) => {
                  const next = new Set(targetTripIds);
                  if (event.target.checked) next.add(trip.id);
                  else next.delete(trip.id);
                  setTargetTripIds(next);
                }}
                className="form-control h-4 w-4 shrink-0 accent-ink"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{trip.name}</span>
            </label>)}
          </div>
          <p className="text-sm text-muted">複製 {selectedCount} 筆至 {targetTripIds.size} 個旅遊</p>
          <div className="flex justify-end gap-2 border-t border-divider pt-4">
            <Button type="button" variant="ghost" disabled={copying} onClick={() => setCopyOpen(false)}>取消</Button>
            <Button type="button" disabled={copying || targetTripIds.size === 0} onClick={() => void copySelected()}>{copying ? "複製中…" : "確認複製"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function resourceRow(resource: TripResource): ResourceBatchRow {
  const note = resource.note?.replace(/\s+/g, " ").trim();
  const noteSummary = note && note.length > 60 ? `${note.slice(0, 60)}…` : note;
  return {
    id: resource.id,
    label: resource.title,
    title: resource.title,
    details: [noteSummary ? `備註 ${noteSummary}` : "", resource.externalUrl ? "有外部連結" : "", resource.imagePath ? "有圖片" : ""],
    resource,
  };
}

function ResourceBatchResultSummary({ result }: { result: ResourceBatchResult }) {
  const successLabel = result.operation === "delete" ? "成功刪除" : "成功複製";
  const failureLabel = result.operation === "delete" ? "刪除失敗" : "複製失敗";
  return <BatchOperationResultSummary
    summaries={[
      { label: successLabel, count: result.successCount },
      { label: failureLabel, count: result.failures.length },
    ]}
    issueGroups={[{ label: failureLabel, issues: result.failures }]}
  />;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
