"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { travelRepository } from "@/lib/travel-repository";
import type { TripInvitation } from "@/lib/types";

export function PendingInvitationsControl({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const { user, ready } = useAuth();
  const [invitations, setInvitations] = useState<TripInvitation[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string>();

  const refresh = useCallback(async () => {
    setInvitations(user ? await travelRepository.getMyPendingInvitations() : []);
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    refresh().catch((error) => toast.error(errorMessage(error, "無法載入共同編輯邀請")));
  }, [ready, refresh]);

  if (invitations.length === 0) return null;

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex h-9 items-center gap-1.5 whitespace-nowrap px-1 text-xs text-muted hover:text-ink" aria-label="查看共同編輯邀請">
      <Mail className="h-4 w-4" /><span>{invitations.length} 個邀請</span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="共同編輯邀請">
        <div className="space-y-3">
          {invitations.map((invitation) => <div key={invitation.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invitation.tripName ?? "旅行邀請"}</p><p className="mt-1 text-xs text-muted">邀請你成為共同編輯者</p></div><Button size="sm" disabled={busyId === invitation.id} onClick={() => {
            setBusyId(invitation.id);
            travelRepository.acceptTripInvitation(invitation.id).then(() => Promise.all([refresh(), onAccepted()])).then(() => {
              toast.success("已接受共同編輯邀請");
              if (invitations.length === 1) setOpen(false);
            }).catch((error) => toast.error(errorMessage(error, "接受邀請失敗"))).finally(() => setBusyId(undefined));
          }}>接受</Button></div>)}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
