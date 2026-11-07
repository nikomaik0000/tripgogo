"use client";

import { useEffect, useMemo, useState } from "react";
import { BatchManagementDialogShell, BatchOperationResultSummary, type BatchManagementIssue } from "@/components/batch-management-dialog-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { displayDate } from "@/lib/travel-dates";
import { travelRepository } from "@/lib/travel-repository";
import type { Flight, HotelStay, Transportation, TravelItem, TripMode } from "@/lib/types";

type EntityTab = "place" | "food" | "flight" | "hotel" | "transportation";
type BatchTab = EntityTab | "all";

type BatchRow = {
  id: string;
  label: string;
  title: string;
  details: string[];
  remove: () => Promise<{ cleanupWarning?: string }>;
};

type BatchResult = {
  successCount: number;
  failures: BatchManagementIssue[];
  cleanupWarnings: BatchManagementIssue[];
};

type TabSets = Record<EntityTab, Set<string>>;

const ENTITY_TABS: EntityTab[] = ["place", "food", "flight", "hotel", "transportation"];
const TRIP_TABS: BatchTab[] = [...ENTITY_TABS, "all"];
const COLLECTION_TABS: EntityTab[] = ["place", "food"];
const TAB_LABELS: Record<BatchTab, string> = {
  place: "地點",
  food: "美食",
  flight: "機票",
  hotel: "住宿",
  transportation: "交通",
  all: "全部",
};

function emptyTabSets(): TabSets {
  return {
    place: new Set(),
    food: new Set(),
    flight: new Set(),
    hotel: new Set(),
    transportation: new Set(),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "刪除失敗";
}

export function BatchManagementDialog({
  open,
  mode,
  tripName,
  items,
  flights = [],
  hotelStays = [],
  transportations = [],
  onOpenChange,
  onRefreshItems,
  onRefreshOutline,
}: {
  open: boolean;
  mode: TripMode;
  tripName?: string;
  items: TravelItem[];
  flights?: Flight[];
  hotelStays?: HotelStay[];
  transportations?: Transportation[];
  onOpenChange: (open: boolean) => void;
  onRefreshItems: () => Promise<void>;
  onRefreshOutline?: () => Promise<void>;
}) {
  const tabs = mode === "trip" ? TRIP_TABS : COLLECTION_TABS;
  const [activeTab, setActiveTab] = useState<BatchTab>("place");
  const [selected, setSelected] = useState<TabSets>(emptyTabSets);
  const [deleted, setDeleted] = useState<TabSets>(emptyTabSets);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationTripName, setConfirmationTripName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchResult>();

  useEffect(() => {
    if (open) return;
    setActiveTab("place");
    setSelected(emptyTabSets());
    setDeleted(emptyTabSets());
    setConfirmOpen(false);
    setConfirmationTripName("");
    setBatchResult(undefined);
  }, [open]);

  const rowsByTab = useMemo<Record<EntityTab, BatchRow[]>>(() => ({
    place: items.filter((item) => item.type === "place" && !deleted.place.has(item.id)).map((item) => travelItemRow(item, mode)),
    food: items.filter((item) => item.type === "food" && !deleted.food.has(item.id)).map((item) => travelItemRow(item, mode)),
    flight: mode === "trip" ? flights.filter((flight) => !deleted.flight.has(flight.id)).map((flight) => ({
      id: flight.id,
      label: `${flight.airline} ${flight.flightNumber}`.trim(),
      title: flight.airline,
      details: [flight.flightNumber, `${flight.departurePlace} → ${flight.arrivalPlace}`, `出發日期 ${displayDate(flight.departureDate)}`],
      remove: async () => {
        await travelRepository.deleteFlight(flight.id);
        return {};
      },
    })) : [],
    hotel: mode === "trip" ? hotelStays.filter((stay) => !deleted.hotel.has(stay.id)).map((stay) => ({
      id: stay.id,
      label: stay.name,
      title: stay.name,
      details: [`Check-in ${displayDate(stay.checkInDate)} → Check-out ${displayDate(stay.checkOutDate)}`],
      remove: async () => {
        await travelRepository.deleteHotelStay(stay.id);
        return {};
      },
    })) : [],
    transportation: mode === "trip" ? transportations.filter((transportation) => !deleted.transportation.has(transportation.id)).map((transportation) => {
      const title = transportation.type === "rental_car"
        ? `${transportation.company} ${transportation.vehicleModel}`.trim()
        : `${transportation.routeName}${transportation.trainNumber ? ` ${transportation.trainNumber}` : ""}`;
      return {
        id: transportation.id,
        label: title,
        title,
        details: [transportation.type === "rental_car" ? "租車" : "JR / 鐵路", `${transportation.departurePlace} → ${transportation.arrivalPlace}`, `開始日期 ${displayDate(transportation.startDate)}`],
        remove: async () => {
          await travelRepository.deleteTransportation(transportation.id);
          return {};
        },
      };
    }) : [],
  }), [deleted, flights, hotelStays, items, mode, transportations]);

  const allRows = useMemo(() => ENTITY_TABS.flatMap((tab) => rowsByTab[tab].map((row) => ({
    ...row,
    id: `${tab}:${row.id}`,
    details: [`類型 ${TAB_LABELS[tab]}`, ...row.details],
    sourceId: row.id,
    tab,
  }))), [rowsByTab]);
  const activeRows = activeTab === "all" ? allRows : rowsByTab[activeTab];
  const selectedEntries = ENTITY_TABS.flatMap((tab) => rowsByTab[tab]
    .filter((row) => selected[tab].has(row.id))
    .map((row) => ({ tab, row })));
  const selectedCount = selectedEntries.length;
  const selectedCounts = Object.fromEntries(ENTITY_TABS.map((tab) => [
    tab,
    selectedEntries.filter((entry) => entry.tab === tab).length,
  ])) as Record<EntityTab, number>;
  const manageableCount = ENTITY_TABS.reduce((count, tab) => count + rowsByTab[tab].length, 0);
  const requiresTripName = mode === "trip" && manageableCount > 0 && selectedCount === manageableCount;
  const activeSelectedIds = activeTab === "all"
    ? new Set(allRows.filter((row) => selected[row.tab].has(row.sourceId)).map((row) => row.id))
    : new Set(rowsByTab[activeTab].filter((row) => selected[activeTab].has(row.id)).map((row) => row.id));

  const setTabSelection = (tab: EntityTab, ids: Set<string>) => {
    setSelected((current) => ({ ...current, [tab]: ids }));
  };

  const toggleRow = (tab: EntityTab, id: string, checked: boolean) => {
    const next = new Set(selected[tab]);
    if (checked) next.add(id);
    else next.delete(id);
    setTabSelection(tab, next);
  };

  const closeDialog = () => {
    if (deleting) return;
    onOpenChange(false);
  };

  const deleteSelected = async () => {
    if (deleting || selectedCount === 0) return;
    if (requiresTripName && confirmationTripName !== tripName) return;
    const selectedRows = selectedEntries;
    const failures: BatchManagementIssue[] = [];
    const cleanupWarnings: BatchManagementIssue[] = [];
    const successfulTabs = new Set<EntityTab>();
    let successCount = 0;

    setConfirmOpen(false);
    setConfirmationTripName("");
    setDeleting(true);
    setBatchResult(undefined);

    for (const [index, entry] of selectedRows.entries()) {
      try {
        const result = await entry.row.remove();
        successCount += 1;
        successfulTabs.add(entry.tab);
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
        if (result.cleanupWarning) cleanupWarnings.push({ index: index + 1, label: entry.row.label, message: result.cleanupWarning });
      } catch (error) {
        failures.push({ index: index + 1, label: entry.row.label, message: errorMessage(error) });
      }
    }

    const refreshes: Promise<void>[] = [];
    if (successfulTabs.has("place") || successfulTabs.has("food")) refreshes.push(onRefreshItems());
    if (onRefreshOutline && (successfulTabs.has("flight") || successfulTabs.has("hotel") || successfulTabs.has("transportation"))) refreshes.push(onRefreshOutline());
    await Promise.allSettled(refreshes);

    setBatchResult({ successCount, failures, cleanupWarnings });
    setDeleting(false);
  };

  return <>
    <BatchManagementDialogShell
      open={open}
      tabs={tabs.map((tab) => ({ value: tab, label: TAB_LABELS[tab] }))}
      activeTab={activeTab}
      rows={activeRows}
      selectedIds={activeSelectedIds}
      selectedCount={selectedCount}
      busy={deleting}
      emptyLabel={`沒有可管理的${TAB_LABELS[activeTab]}`}
      result={batchResult ? <BatchResultSummary result={batchResult} /> : undefined}
      footerActions={<div className="flex min-w-0 items-center justify-end gap-2">
        <Button type="button" variant="ghost" disabled={deleting} onClick={closeDialog}>取消</Button>
        <Button type="button" variant="destructive" disabled={deleting || selectedCount === 0} onClick={() => { setConfirmationTripName(""); setConfirmOpen(true); }}>{deleting ? "刪除中…" : `刪除 ${selectedCount} 筆`}</Button>
      </div>}
      onOpenChange={onOpenChange}
      onTabChange={setActiveTab}
      onToggleRow={(id, checked) => {
        if (activeTab !== "all") {
          toggleRow(activeTab, id, checked);
          return;
        }
        const entry = allRows.find((row) => row.id === id);
        if (entry) toggleRow(entry.tab, entry.sourceId, checked);
      }}
      onSelectAll={() => {
        if (activeTab !== "all") {
          setTabSelection(activeTab, new Set(activeRows.map((row) => row.id)));
          return;
        }
        setSelected(Object.fromEntries(ENTITY_TABS.map((tab) => [tab, new Set(rowsByTab[tab].map((row) => row.id))])) as TabSets);
      }}
      onClearSelection={() => {
        if (activeTab !== "all") {
          setTabSelection(activeTab, new Set());
          return;
        }
        setSelected(emptyTabSets());
      }}
    />

    <Dialog open={confirmOpen} onOpenChange={(next) => { if (!deleting) { setConfirmOpen(next); if (!next) setConfirmationTripName(""); } }}>
      <DialogContent title="確認批次刪除" preventOutsideDismiss={deleting} onEscapeKeyDown={(event) => { if (deleting) event.preventDefault(); }}>
        <div className="space-y-3 text-sm text-muted">
          {mode === "trip" ? <>
            <p>旅程：<span className="font-medium text-ink">{tripName}</span></p>
            <p>確定刪除已選的 {selectedCount} 筆資料嗎？</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {ENTITY_TABS.map((tab) => <span key={tab}>{TAB_LABELS[tab]} {selectedCounts[tab]} 筆</span>)}
            </div>
          </> : <p>確定刪除已選的 {selectedCount} 筆資料嗎？</p>}
          <p>此操作無法復原。</p>
          {requiresTripName && <label className="block space-y-2 pt-2">
            <span className="block text-xs">已選取目前旅程內全部可批次刪除項目。請輸入完整旅程名稱「{tripName}」以確認：</span>
            <Input value={confirmationTripName} disabled={deleting} autoComplete="off" onChange={(event) => setConfirmationTripName(event.target.value)} />
          </label>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={deleting} onClick={() => { setConfirmOpen(false); setConfirmationTripName(""); }}>取消</Button>
          <Button type="button" variant="destructive" disabled={deleting || selectedCount === 0 || (requiresTripName && confirmationTripName !== tripName)} onClick={() => void deleteSelected()}>{deleting ? "刪除中…" : `刪除 ${selectedCount} 筆`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function travelItemRow(item: TravelItem, mode: TripMode): BatchRow {
  const details = mode === "trip" ? [`日期 ${displayDate(item.date) || "未定"}`] : [];
  details.push(`地區 ${item.area || "未分類"}`, `分類 ${item.category || "未分類"}`);
  return {
    id: item.id,
    label: item.name,
    title: item.name,
    details,
    remove: () => travelRepository.deleteItem(item.id),
  };
}

function BatchResultSummary({ result }: { result: BatchResult }) {
  return <BatchOperationResultSummary
    summaries={[
      { label: "成功刪除", count: result.successCount },
      { label: "刪除失敗", count: result.failures.length },
      { label: "圖片清理警告", count: result.cleanupWarnings.length },
    ]}
    issueGroups={[
      { label: "刪除失敗", issues: result.failures },
      { label: "刪除成功但圖片 cleanup warning", issues: result.cleanupWarnings },
    ]}
  />;
}
