"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { travelRepository } from "@/lib/travel-repository";
import type { TripEditor, TripInvitation } from "@/lib/types";

export function TripMembersManager({ tripId }: { tripId: string }) {
  const [email, setEmail] = useState("");
  const [editors, setEditors] = useState<TripEditor[]>([]);
  const [invitations, setInvitations] = useState<TripInvitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TripEditor>();

  const refresh = useCallback(async () => {
    const [nextEditors, nextInvitations] = await Promise.all([
      travelRepository.getTripEditors(tripId),
      travelRepository.getTripPendingInvitations(tripId),
    ]);
    setEditors(nextEditors);
    setInvitations(nextInvitations);
  }, [tripId]);

  useEffect(() => {
    refresh().catch((error) => toast.error(errorMessage(error, "無法載入共同編輯者")));
  }, [refresh]);

  return (
    <section className="mt-6 border-t border-divider pt-6" aria-labelledby="trip-members-title">
      <div className="mb-4">
        <h3 id="trip-members-title" className="text-sm font-semibold">共同編輯者</h3>
        <p className="mt-1 text-xs text-muted">受邀者接受後即可共同編輯這趟旅行。</p>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => {
        event.preventDefault();
        const value = email.trim().toLowerCase();
        if (!value) return;
        setBusy(true);
        travelRepository.inviteTripEditor(tripId, value).then(() => refresh()).then(() => {
          setEmail("");
          toast.success("邀請已建立");
        }).catch((error) => toast.error(errorMessage(error, "邀請失敗"))).finally(() => setBusy(false));
      }}>
        <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="editor@example.com" aria-label="共同編輯者 Email" className="min-w-0 flex-1" />
        <Button type="submit" disabled={busy} className="shrink-0">邀請</Button>
      </form>

      <div className="mt-5 space-y-5">
        <MemberList title="已加入" empty="尚無共同編輯者">
          {editors.map((editor) => <MemberRow key={editor.userId} email={editor.email} label={editor.displayName} actionLabel="移除共同編輯者" onAction={() => setRemoving(editor)} />)}
        </MemberList>
        <MemberList title="等待接受" empty="目前沒有待接受邀請">
          {invitations.map((invitation) => <MemberRow key={invitation.id} email={invitation.email} label="Pending" actionLabel="撤銷邀請" onAction={() => {
            setBusy(true);
            travelRepository.revokeTripInvitation(invitation.id).then(() => refresh()).then(() => toast.success("邀請已撤銷")).catch((error) => toast.error(errorMessage(error, "撤銷失敗"))).finally(() => setBusy(false));
          }} disabled={busy} />)}
        </MemberList>
      </div>

      <ConfirmDialog open={Boolean(removing)} title="移除共同編輯者" description={`確定移除「${removing?.email ?? ""}」的編輯權限？`} onOpenChange={(open) => { if (!open) setRemoving(undefined); }} onConfirm={() => {
        if (!removing) return;
        setBusy(true);
        travelRepository.removeTripEditor(tripId, removing.userId).then(() => refresh()).then(() => {
          setRemoving(undefined);
          toast.success("已移除共同編輯者");
        }).catch((error) => toast.error(errorMessage(error, "移除失敗"))).finally(() => setBusy(false));
      }} />
    </section>
  );
}

function MemberList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return <div><p className="mb-2 text-xs font-medium text-muted">{title}</p>{children.length > 0 ? <div className="divide-y divide-divider rounded-lg border border-border px-3">{children}</div> : <p className="text-xs text-muted">{empty}</p>}</div>;
}

function MemberRow({ email, label, actionLabel, onAction, disabled }: { email: string; label?: string; actionLabel: string; onAction: () => void; disabled?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3 py-3"><UserRound className="h-4 w-4 shrink-0 text-muted" /><div className="min-w-0 flex-1"><p className="truncate text-sm">{email}</p>{label && <p className="mt-0.5 truncate text-xs text-muted">{label}</p>}</div><button type="button" disabled={disabled} onClick={onAction} aria-label={actionLabel} title={actionLabel} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink disabled:opacity-30"><Trash2 className="h-[18px] w-[18px]" /></button></div>;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
