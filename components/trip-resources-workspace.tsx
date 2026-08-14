"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CarFront, ExternalLink, FolderHeart, ImageIcon, ImageUp, SquarePen, StickyNote, TicketPercent, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddIconButton } from "@/components/add-icon-button";
import { AuthControl } from "@/components/auth-control";
import { ClampedNote } from "@/components/clamped-note";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TripPrimaryNav } from "@/components/trip-primary-nav";
import { useAuth } from "@/lib/auth-context";
import { travelRepository } from "@/lib/travel-repository";
import type { Trip, TripResource, TripResourceCategory, TripRole } from "@/lib/types";

const CATEGORY_LABELS: Record<TripResourceCategory, string> = {
  transportation: "交通",
  coupon: "優惠券",
  note: "備忘",
};

const RESOURCE_CATEGORIES = [
  { value: "transportation" as const, label: "交通", icon: CarFront },
  { value: "coupon" as const, label: "優惠券", icon: TicketPercent },
  { value: "note" as const, label: "備忘", icon: StickyNote },
];

export function TripResourcesWorkspace({ tripId, initialTrip }: { tripId: string; initialTrip?: Trip }) {
  const { user, ready: authReady } = useAuth();
  const [trip, setTrip] = useState(initialTrip);
  const [resources, setResources] = useState<TripResource[]>([]);
  const [role, setRole] = useState<TripRole>();
  const [activeCategory, setActiveCategory] = useState<TripResourceCategory>("transportation");
  const [dialog, setDialog] = useState<{ open: boolean; resource?: TripResource; initialCategory?: TripResourceCategory }>({ open: false });
  const [deleting, setDeleting] = useState<TripResource>();

  const refresh = useCallback(async () => {
    try {
      const [nextTrip, nextResources] = await Promise.all([
        travelRepository.getTrip(tripId),
        travelRepository.getTripResources(tripId),
      ]);
      setTrip(nextTrip);
      setResources(nextResources);
    } catch (error) {
      toast.error(errorMessage(error, "無法載入旅途資訊"));
    }
  }, [tripId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!authReady || !user) {
      setRole(undefined);
      return;
    }
    travelRepository.getTripRole(tripId).then(setRole)
      .catch((error) => toast.error(errorMessage(error, "無法確認編輯權限")));
  }, [authReady, tripId, user]);

  if (!trip) {
    return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Link href="/" className="flex items-center gap-2 text-sm text-muted"><ArrowLeft className="h-5 w-5" />返回</Link><EmptyState title="找不到這趟旅行" description="" /></main>;
  }

  const canEdit = Boolean(role);
  const jumpToCategory = (category: TripResourceCategory) => {
    setActiveCategory(category);
    const target = document.getElementById(`resource-category-${category}`) ?? document.getElementById("resource-categories");
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 mb-8 border-b border-border bg-bg/90 px-4 pb-4 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mb-4 flex items-center gap-3">
          <Link href={`/trip/${tripId}`} aria-label="返回旅行" title="返回旅行" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink sm:h-9 sm:w-9"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="min-w-0 flex-1 truncate text-title font-semibold">{trip.name}</h1>
          <div className="flex w-[140px] shrink-0 items-center justify-end gap-2">
            {canEdit ? <AddIconButton context="header" label="新增旅途資訊" onClick={() => setDialog({ open: true })} /> : <span aria-hidden="true" className="h-11 w-11 shrink-0" />}
            <Link href={`/trip/${tripId}/resources`} aria-label="旅途資訊" title="旅途資訊" aria-current="page" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface hover:text-ink"><FolderHeart className="h-5 w-5" /></Link>
            <AuthControl />
          </div>
        </div>
        <TripPrimaryNav tripId={tripId} />
      </header>

      <div className="mb-6 flex items-center gap-3"><FolderHeart className="h-5 w-5 text-muted" /><h2 className="text-title font-semibold">旅途資訊</h2></div>
      <nav id="resource-categories" aria-label="旅途資訊分類快速導覽" className="no-scrollbar mb-6 max-w-full scroll-mt-36 overflow-x-auto"><div className="flex min-w-max flex-nowrap items-center gap-5 pr-4">{RESOURCE_CATEGORIES.map(({ value, label }) => <button key={value} type="button" onClick={() => jumpToCategory(value)} aria-current={activeCategory === value ? "location" : undefined} className={`shrink-0 border-b pb-1 text-xs transition-colors ${activeCategory === value ? "border-muted text-ink" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>)}</div></nav>
      {resources.length === 0 && !canEdit
        ? <EmptyState title="尚無旅途資訊" description="" />
        : <div className="space-y-12">{RESOURCE_CATEGORIES.map(({ value, label, icon: Icon }) => {
          const categoryResources = resources.filter((resource) => resource.category === value);
          if (categoryResources.length === 0 && !canEdit) return null;
          return <section id={`resource-category-${value}`} key={value} className="scroll-mt-36"><header className="mb-4 flex items-center"><Icon className="h-5 w-5 shrink-0 text-muted" /><h2 className="ml-3 whitespace-nowrap text-sm font-semibold tracking-body">{label}</h2>{canEdit && <AddIconButton label={`新增${label}`} onClick={() => setDialog({ open: true, initialCategory: value })} className="ml-auto" />}</header>{categoryResources.length > 0 && <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{categoryResources.map((resource) => <ResourceCard key={resource.id} resource={resource} canEdit={canEdit} onEdit={() => setDialog({ open: true, resource })} onDelete={() => setDeleting(resource)} />)}</div>}</section>;
        })}</div>}

      <ResourceDialog open={dialog.open} resource={dialog.resource} initialCategory={dialog.initialCategory} tripId={tripId} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} onSaved={() => { setDialog({ open: false }); refresh(); }} />
      <ConfirmDialog open={Boolean(deleting)} title="刪除旅途資訊" description={`確定刪除「${deleting?.title ?? ""}」？圖片檔案將保留，避免影響其他複本。`} onOpenChange={(open) => { if (!open) setDeleting(undefined); }} onConfirm={() => {
        if (!deleting) return;
        travelRepository.deleteTripResource(deleting.id).then(refresh).then(() => { setDeleting(undefined); toast.success("已刪除"); }).catch((error) => toast.error(errorMessage(error, "刪除失敗")));
      }} />
    </main>
  );
}

function ResourceCard({ resource, canEdit, onEdit, onDelete }: { resource: TripResource; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  return <article className="flex min-w-0 flex-col self-start rounded-card border border-border bg-surface px-6 pt-6 shadow-soft sm:h-full sm:self-stretch">
    <header className="pb-5"><h3 className="line-clamp-2 font-medium">{resource.title}</h3><p className="mt-1 text-xs text-muted">{CATEGORY_LABELS[resource.category]}</p></header>
    {(resource.imagePath || resource.note) && <div className="border-t border-divider" />}
    {resource.imagePath && <ResourceImage path={resource.imagePath} title={resource.title} />}
    {resource.note && <div className={`${resource.imagePath ? "border-t border-divider" : ""} py-5`}><ClampedNote note={resource.note} lines={resource.imagePath ? 2 : 10} linkify /></div>}
    <footer className="mt-auto flex h-14 shrink-0 items-center border-t border-divider">
      {resource.externalUrl && <a href={resource.externalUrl} target="_blank" rel="noopener noreferrer" aria-label="開啟外部連結" title="開啟外部連結" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink sm:h-9 sm:w-9"><ExternalLink className="h-[18px] w-[18px]" /></a>}
      {canEdit && <div className="ml-auto flex items-center gap-4"><Action label="編輯" onClick={onEdit}><SquarePen /></Action><Action label="刪除" onClick={onDelete}><Trash2 /></Action></div>}
    </footer>
  </article>;
}

function ResourceImage({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState<string>();
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    let active = true;
    travelRepository.getTripResourceImageUrl(path).then((value) => { if (active) setUrl(value); }).catch(() => { if (active) setUrl(undefined); });
    return () => { active = false; };
  }, [path]);
  return <>
    <button type="button" disabled={!url} onClick={() => setPreview(true)} className="my-5 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-bg disabled:cursor-default" aria-label={`放大查看${title}`}>
      {/* Signed private Storage URLs are short-lived and cannot be configured as a static Next Image host. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={title} className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted" />}
    </button>
    <Dialog open={preview} onOpenChange={setPreview}>
      <DialogContent title={title} className="max-w-4xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt={title} className="max-h-[70vh] w-full object-contain" />}
      </DialogContent>
    </Dialog>
  </>;
}

function ResourceDialog({ open, resource, initialCategory, tripId, onOpenChange, onSaved }: { open: boolean; resource?: TripResource; initialCategory?: TripResourceCategory; tripId: string; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ category: "note" as TripResourceCategory, title: "", note: "", externalUrl: "", imagePath: "" });
  const [file, setFile] = useState<File>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm({ category: resource?.category ?? initialCategory ?? "note", title: resource?.title ?? "", note: resource?.note ?? "", externalUrl: resource?.externalUrl ?? "", imagePath: resource?.imagePath ?? "" });
    setFile(undefined);
  }, [initialCategory, open, resource]);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={`${resource ? "編輯" : "新增"}旅途資訊`}><form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return toast.error("請填寫標題");
    setSaving(true);
    try {
      const imagePath = file ? await travelRepository.uploadTripResourceImage(tripId, file) : form.imagePath || undefined;
      await travelRepository.saveTripResource({ id: resource?.id, tripId, category: form.category, title: form.title.trim(), note: form.note.trim() || undefined, externalUrl: form.externalUrl.trim() || undefined, imagePath });
      toast.success(resource ? "已更新" : "已新增");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, "儲存失敗"));
    } finally {
      setSaving(false);
    }
  }}>
    <Field label="分類"><Select value={form.category} onValueChange={(value) => set("category", value as TripResourceCategory)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
    <Field label="標題"><Input required value={form.title} onChange={(event) => set("title", event.target.value)} /></Field>
    <Field label="備註（選填）"><Textarea rows={4} value={form.note} onChange={(event) => set("note", event.target.value)} /></Field>
    <Field label="外部網址（選填）"><Input type="url" value={form.externalUrl} onChange={(event) => set("externalUrl", event.target.value)} /></Field>
    <div className="space-y-2 text-sm"><span className="font-medium">圖片（選填）</span><ResourceImageUpload file={file} imagePath={form.imagePath} onFileChange={setFile} onRemove={() => { setFile(undefined); set("imagePath", ""); }} /></div>
    <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button></div>
  </form></DialogContent></Dialog>;
}

function ResourceImageUpload({ file, imagePath, onFileChange, onRemove }: { file?: File; imagePath: string; onFileChange: (file: File | undefined) => void; onRemove: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      return () => { active = false; URL.revokeObjectURL(objectUrl); };
    }
    if (imagePath) {
      travelRepository.getTripResourceImageUrl(imagePath).then((url) => { if (active) setPreviewUrl(url); }).catch(() => { if (active) setPreviewUrl(undefined); });
    } else {
      setPreviewUrl(undefined);
    }
    return () => { active = false; };
  }, [file, imagePath]);

  const choose = (nextFile?: File) => {
    if (!nextFile) return;
    const error = validateResourceImage(nextFile);
    if (error) {
      toast.error(error);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onFileChange(nextFile);
  };
  const resetInput = () => { if (inputRef.current) inputRef.current.value = ""; };
  const remove = () => { resetInput(); onRemove(); };

  return <div className="min-w-0 space-y-3">
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" tabIndex={-1} className="sr-only" onChange={(event) => choose(event.target.files?.[0])} />
    <button
      type="button"
      aria-label={previewUrl ? "更換圖片" : "選擇或拖曳圖片"}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setIsDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setIsDragging(false); }}
      onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setIsDragging(false); choose(event.dataTransfer.files[0]); }}
      className={`flex min-h-44 w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-card border border-dashed px-4 py-5 text-center transition-colors ${isDragging ? "border-muted bg-searchBackground text-ink" : "border-border bg-bg text-muted hover:border-muted hover:bg-searchBackground hover:text-ink"}`}
    >
      {previewUrl
        ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="圖片預覽" className="max-h-56 w-full object-contain" />
          {file && <span className="mt-3 max-w-full truncate text-xs text-muted">{file.name}</span>}
        </>
        : <><ImageUp className="mb-3 h-6 w-6" /><span className="font-medium text-ink">拖曳圖片到這裡</span><span className="mt-1 text-xs">或點擊選擇圖片</span><span className="mt-3 text-xs leading-5">JPG / PNG / WebP / GIF<br />最大 10 MB</span></>}
    </button>
    {previewUrl && <div className="flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>更換圖片</Button><Button type="button" size="sm" variant="ghost" onClick={remove}>移除圖片</Button></div>}
  </div>;
}

function validateResourceImage(file: File) {
  const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!supportedTypes.has(file.type)) return "圖片格式僅支援 JPG、PNG、WebP 或 GIF";
  if (file.size > 10 * 1024 * 1024) return "圖片大小不可超過 10 MB";
  return undefined;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}

function Action({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactElement<{ className?: string }> }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink sm:h-9 sm:w-9"><span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{children}</span></button>;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
