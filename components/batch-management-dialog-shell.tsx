"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type BatchManagementShellTab<T extends string> = {
  value: T;
  label: string;
};

export type BatchManagementShellRow = {
  id: string;
  title: string;
  details: string[];
};

export type BatchManagementIssue = {
  index: number;
  label: string;
  message: string;
};

export function BatchManagementDialogShell<T extends string>({
  open,
  tabs,
  activeTab,
  rows,
  selectedIds,
  selectedCount,
  busy,
  emptyLabel,
  result,
  footerActions,
  stackFooterOnMobile = false,
  onOpenChange,
  onTabChange,
  onToggleRow,
  onSelectAll,
  onClearSelection,
}: {
  open: boolean;
  tabs: BatchManagementShellTab<T>[];
  activeTab: T;
  rows: BatchManagementShellRow[];
  selectedIds: Set<string>;
  selectedCount: number;
  busy: boolean;
  emptyLabel: string;
  result?: ReactNode;
  footerActions: ReactNode;
  stackFooterOnMobile?: boolean;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: T) => void;
  onToggleRow: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const activeSelectedCount = rows.filter((row) => selectedIds.has(row.id)).length;

  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onOpenChange(false); }}>
    <DialogContent
      title="批次管理"
      preventOutsideDismiss={busy}
      onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
      className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 sm:h-[min(720px,calc(100dvh-4rem))] sm:max-h-[min(720px,calc(100dvh-4rem))] [&>div:first-child]:mb-0 [&>div:first-child]:shrink-0 [&>div:first-child]:px-5 [&>div:first-child]:pt-5 sm:[&>div:first-child]:px-6 sm:[&>div:first-child]:pt-6"
    >
      <div
        className="grid shrink-0 border-b border-divider px-3 pt-4"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        role="tablist"
        aria-label="批次管理類型"
      >
        {tabs.map((tab) => <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.value}
          disabled={busy}
          onClick={() => onTabChange(tab.value)}
          className={`min-w-0 px-1 pb-3 text-xs transition-colors ${activeTab === tab.value ? "font-medium text-ink" : "font-normal text-muted hover:text-[#555555]"}`}
        >{tab.label}</button>)}
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-divider px-5 py-3 sm:px-6">
        <span className="min-w-0 text-xs text-muted">本頁已選 {activeSelectedCount} / {rows.length}</span>
        <div className="flex shrink-0 items-center gap-4">
          <button type="button" disabled={busy || rows.length === 0} onClick={onSelectAll} className="text-xs text-muted transition-colors hover:text-ink disabled:opacity-40">全選</button>
          <button type="button" disabled={busy || selectedIds.size === 0} onClick={onClearSelection} className="text-xs text-muted transition-colors hover:text-ink disabled:opacity-40">取消全選</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
        {result}
        {rows.length === 0
          ? <p className="flex min-h-0 flex-1 items-center justify-center px-5 py-12 text-center text-sm text-muted sm:px-6">{emptyLabel}</p>
          : <div>{rows.map((row) => <label key={row.id} className="flex min-w-0 cursor-pointer items-start gap-3 border-b border-divider px-5 py-4 last:border-b-0 sm:px-6">
            <input type="checkbox" checked={selectedIds.has(row.id)} disabled={busy} onChange={(event) => onToggleRow(row.id, event.target.checked)} className="form-control mt-0.5 h-4 w-4 shrink-0 accent-ink" />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium text-ink">{row.title}</span>
              <span className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-muted">{row.details.filter(Boolean).map((detail) => <span key={detail} className="min-w-0 break-words">{detail}</span>)}</span>
            </span>
          </label>)}</div>}
      </div>

      <div className={cn(
        "min-w-0 shrink-0 gap-3 border-t border-divider bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6",
        stackFooterOnMobile ? "flex flex-col items-stretch sm:flex-row sm:items-center sm:justify-between" : "flex items-center justify-between",
      )}>
        <span className="shrink-0 text-sm text-muted">已選 {selectedCount} 筆</span>
        {footerActions}
      </div>
    </DialogContent>
  </Dialog>;
}

export function BatchOperationResultSummary({ summaries, issueGroups }: {
  summaries: { label: string; count: number }[];
  issueGroups: { label: string; issues: BatchManagementIssue[] }[];
}) {
  return <div className="space-y-3 border-b border-divider px-5 py-4 text-xs sm:px-6">
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
      {summaries.map((summary) => <span key={summary.label}>{summary.label} {summary.count} 筆</span>)}
    </div>
    {issueGroups.filter((group) => group.issues.length > 0).map((group) => <BatchIssueList key={group.label} label={group.label} issues={group.issues} />)}
  </div>;
}

function BatchIssueList({ label, issues }: { label: string; issues: BatchManagementIssue[] }) {
  return <div className="space-y-1">
    <p className="font-medium text-ink">{label}</p>
    <ul className="space-y-1 text-muted">{issues.map((issue) => <li key={`${issue.index}-${issue.label}`} className="break-words">{issue.index}. {issue.label}：{issue.message}</li>)}</ul>
  </div>;
}
