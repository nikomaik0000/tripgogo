"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TripMembersManager } from "@/components/trip-members-manager";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Trip, TripRole } from "@/lib/types";

export function TripFormDialog({ open, trip, role, onOpenChange, onSave }: {
  open: boolean;
  trip?: Trip;
  role?: TripRole;
  onOpenChange: (open: boolean) => void;
  onSave: (value: Pick<Trip, "name" | "startDate" | "endDate" | "isPublic">) => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(trip?.name ?? "");
    setStartDate(trip?.startDate ?? "");
    setEndDate(trip?.endDate ?? "");
    setIsPublic(trip?.isPublic ?? true);
  }, [open, trip]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={trip ? "編輯旅行" : "新增旅行"}>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || !startDate || !endDate) return toast.error("請完整填寫資料");
          if (endDate < startDate) return toast.error("結束日期不可早於開始日期");
          onSave({ name: name.trim(), startDate, endDate, isPublic });
        }}>
          <Field label="旅遊名稱"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="開始日期"><Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="結束日期"><Input required type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
          {(!trip || role === "owner") && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium">公開旅行</span>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} aria-label="公開旅行" />
              </div>
              <p className="text-xs text-muted">
                {isPublic ? "開啟：任何人都可以查看" : "關閉：只有 Owner 與已接受邀請的 Editor 可以查看"}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit">儲存</Button>
          </div>
        </form>
        {trip && role === "owner" && <TripMembersManager tripId={trip.id} />}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}
