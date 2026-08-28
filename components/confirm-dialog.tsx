"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ConfirmDialog({ open, title, description, confirmLabel = "刪除", onOpenChange, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        <p className="text-sm text-muted">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useUnsavedChangesDialog(isDirty: boolean, onDiscard: () => void) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requestClose = useCallback(() => {
    if (isDirty) {
      setConfirmOpen(true);
      return;
    }
    onDiscard();
  }, [isDirty, onDiscard]);
  const confirmDiscard = useCallback(() => {
    setConfirmOpen(false);
    onDiscard();
  }, [onDiscard]);
  const unsavedChangesDialog = (
    <ConfirmDialog
      open={confirmOpen}
      title="尚未儲存"
      description="確定要離開嗎？"
      confirmLabel="離開"
      onOpenChange={setConfirmOpen}
      onConfirm={confirmDiscard}
    />
  );
  return { requestClose, unsavedChangesDialog };
}
