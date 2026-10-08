"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { travelRepository } from "@/lib/travel-repository";
import type { PendingTripInvitation } from "@/lib/types";

export function PendingInvitationsControl({ onAccepted }: { onAccepted: () => Promise<void> }) {
  const { user, ready } = useAuth();
  const [invitations, setInvitations] = useState<PendingTripInvitation[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const nextInvitations = user ? await travelRepository.getMyPendingInvitations() : [];
    if (version === refreshVersion.current) setInvitations(nextInvitations);
  }, [user]);
  const removeInvitation = useCallback((invitationId: string) => {
    refreshVersion.current += 1;
    setInvitations((current) => current.filter((invitation) => invitation.id !== invitationId));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const load = () => {
      refresh().catch((error) => toast.error(errorMessage(error, "無法載入共同編輯邀請")));
    };
    const loadWhenVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    load();
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", load);
    document.addEventListener("visibilitychange", loadWhenVisible);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", load);
      document.removeEventListener("visibilitychange", loadWhenVisible);
    };
  }, [ready, refresh]);

  useEffect(() => {
    if (invitations.length === 0) setOpen(false);
  }, [invitations.length]);

  if (invitations.length === 0) return null;

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex h-9 items-center gap-1.5 whitespace-nowrap px-1 text-xs text-muted hover:text-[#555555]" aria-label="查看共同編輯邀請">
      <Mail className="h-4 w-4" /><span>{invitations.length} 個邀請</span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="共同編輯邀請">
        <div className="space-y-3">
          {invitations.map((invitation) => <div key={invitation.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invitation.tripName ?? "旅行邀請"}</p><p className="mt-1 text-xs text-muted">邀請你成為共同編輯者</p></div><Button variant="outline" size="sm" disabled={Boolean(busyId)} onClick={() => {
            setBusyId(invitation.id);
            travelRepository.rejectTripInvitation(invitation.id).then(() => {
              removeInvitation(invitation.id);
              toast.success("已拒絕共同編輯邀請");
            }).catch((error) => toast.error(errorMessage(error, "拒絕邀請失敗"))).finally(() => setBusyId(undefined));
          }}>拒絕</Button><Button size="sm" disabled={Boolean(busyId)} onClick={() => {
            setBusyId(invitation.id);
            travelRepository.acceptTripInvitation(invitation.id).then(async () => {
              removeInvitation(invitation.id);
              toast.success("已接受共同編輯邀請");
              try {
                await onAccepted();
              } catch (error) {
                toast.error(errorMessage(error, "邀請已接受，但首頁更新失敗"));
              }
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
