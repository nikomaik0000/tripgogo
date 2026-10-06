"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUnsavedChangesDialog } from "@/components/confirm-dialog";
import { TripMembersManager } from "@/components/trip-members-manager";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Trip, TripMode, TripRole } from "@/lib/types";

export function TripFormDialog({ open, trip, role, canManage = role === "owner", onOpenChange, onSave }: {
  open: boolean;
  trip?: Trip;
  role?: TripRole;
  canManage?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: Pick<Trip, "name" | "mode" | "startDate" | "endDate" | "isPublic">) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<TripMode>("trip");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(trip?.name ?? "");
    setMode(trip?.mode ?? "trip");
    setStartDate(trip?.startDate ?? "");
    setEndDate(trip?.endDate ?? "");
    setIsPublic(trip?.isPublic ?? true);
  }, [open, trip]);

  const isDirty = name !== (trip?.name ?? "") || mode !== (trip?.mode ?? "trip") || startDate !== (trip?.startDate ?? "") || endDate !== (trip?.endDate ?? "") || isPublic !== (trip?.isPublic ?? true);
  const { requestClose, unsavedChangesDialog } = useUnsavedChangesDialog(isDirty, () => onOpenChange(false));

  return <>
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogContent title={trip ? "編輯旅行" : "新增旅行"} preventOutsideDismiss onEscapeKeyDown={(event) => { event.preventDefault(); requestClose(); }}>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return toast.error("請填寫名稱");
          if (mode === "trip" && (!startDate || !endDate)) return toast.error("請完整填寫日期");
          if (mode === "trip" && endDate < startDate) return toast.error("結束日期不可早於開始日期");
          onSave({ name: name.trim(), mode, startDate: mode === "trip" ? startDate : null, endDate: mode === "trip" ? endDate : null, isPublic });
        }}>
          {!trip && <div className="grid grid-cols-2 gap-2" role="group" aria-label="項目模式">{(["trip", "collection"] as const).map((value) => <Button key={value} type="button" variant={mode === value ? "default" : "outline"} onClick={() => setMode(value)}>{value === "trip" ? "旅程" : "收藏"}</Button>)}</div>}
          <Field label={mode === "trip" ? "旅遊名稱" : "收藏名稱"}><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {mode === "trip" && <><Field label="開始日期"><Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field><Field label="結束日期"><Input required type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field></>}
          {(!trip || canManage) && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium">公開{mode === "trip" ? "旅行" : "收藏"}</span>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} aria-label={`公開${mode === "trip" ? "旅行" : "收藏"}`} />
              </div>
              <p className="text-xs text-muted">
                {isPublic ? "開啟：任何人都可以查看" : "關閉：只有 Owner 與已接受邀請的 Editor 可以查看"}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={requestClose}>取消</Button>
            <Button type="submit">儲存</Button>
          </div>
        </form>
        {trip && canManage && <TripMembersManager tripId={trip.id} />}
      </DialogContent>
    </Dialog>
    {unsavedChangesDialog}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
