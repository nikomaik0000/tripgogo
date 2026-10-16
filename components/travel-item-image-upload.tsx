"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TravelItemImageCropDialog } from "@/components/travel-item-image-crop-dialog";
import { Button } from "@/components/ui/button";
import { travelRepository } from "@/lib/travel-repository";
import { getTravelItemImageFormat, validateTravelItemImageSource } from "@/lib/travel-item-image";
import type { TravelItemImageFit } from "@/lib/types";

export function TravelItemImageUpload({ file, imagePath, imageFit, disabled = false, onFileChange, onRemove, onFitChange }: {
  file?: File;
  imagePath?: string;
  imageFit: TravelItemImageFit;
  disabled?: boolean;
  onFileChange: (file: File) => void;
  onRemove: () => void;
  onFitChange: (fit: TravelItemImageFit) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [cropSource, setCropSource] = useState<File>();
  const [editableSource, setEditableSource] = useState<File>();
  const [cropOpen, setCropOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      return () => {
        active = false;
        URL.revokeObjectURL(objectUrl);
      };
    }
    if (imagePath) {
      travelRepository.getTravelItemImageUrl(imagePath)
        .then((url) => { if (active) setPreviewUrl(url); })
        .catch(() => { if (active) setPreviewUrl(undefined); });
    } else {
      setPreviewUrl(undefined);
    }
    return () => { active = false; };
  }, [file, imagePath]);

  const openCrop = useCallback((source: File) => {
    setCropSource(source);
    setCropOpen(true);
  }, []);
  const choose = useCallback((nextFile?: File) => {
    if (!nextFile || disabled || preparing) return;
    const error = validateTravelItemImageSource(nextFile);
    if (error) {
      toast.error(error);
      resetInput(inputRef.current);
      return;
    }
    resetInput(inputRef.current);
    openCrop(nextFile);
  }, [disabled, openCrop, preparing]);

  useEffect(() => {
    const dialog = rootRef.current?.closest('[role="dialog"]');
    if (!dialog) return;
    const handleDialogPaste = (event: Event) => {
      const pasteEvent = event as ClipboardEvent;
      if (pasteEvent.defaultPrevented || disabled || preparing || isTextPasteTarget(pasteEvent.target) || isTextPasteTarget(document.activeElement)) return;
      const pastedFile = getClipboardImageFile(pasteEvent.clipboardData);
      if (!pastedFile) return;
      pasteEvent.preventDefault();
      choose(withClipboardName(pastedFile));
    };
    dialog.addEventListener("paste", handleDialogPaste);
    return () => dialog.removeEventListener("paste", handleDialogPaste);
  }, [choose, disabled, preparing]);

  const adjust = async () => {
    if (disabled || preparing) return;
    if (editableSource) {
      setCropSource(editableSource);
      setCropOpen(true);
      return;
    }
    if (file) {
      openCrop(file);
      return;
    }
    if (!imagePath) return;
    setPreparing(true);
    try {
      const signedUrl = await travelRepository.getTravelItemImageUrl(imagePath);
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error("無法載入原有圖片");
      const blob = await response.blob();
      const mime = getTravelItemImageFormat(blob.type) ? blob.type : mimeFromPath(imagePath);
      const format = getTravelItemImageFormat(mime);
      if (!format) throw new Error("原有圖片格式不受支援");
      const source = new File([blob], `travel-item.${format.extension}`, { type: mime, lastModified: Date.now() });
      const error = validateTravelItemImageSource(source);
      if (error) throw new Error(error);
      openCrop(source);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "無法載入原有圖片");
    } finally {
      setPreparing(false);
    }
  };

  const remove = () => {
    resetInput(inputRef.current);
    setEditableSource(undefined);
    setCropSource(undefined);
    setCropOpen(false);
    onRemove();
  };
  const busy = disabled || preparing;
  const hasImage = Boolean(file || imagePath);

  return <><div ref={rootRef} className="min-w-0 space-y-3">
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} className="sr-only" disabled={busy} onChange={(event) => void choose(event.target.files?.[0])} />
    <button
      type="button"
      disabled={busy}
      aria-label={hasImage ? "調整圖片；也可貼上或拖曳圖片來更換" : "拖曳、貼上或選擇圖片"}
      onClick={() => hasImage ? void adjust() : inputRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setIsDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setIsDragging(false); }}
      onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setIsDragging(false); choose(event.dataTransfer.files[0]); }}
      className={`flex h-[140px] min-h-[140px] w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-card border border-dashed text-center transition-colors disabled:cursor-wait ${hasImage ? "p-0" : "px-4 py-2"} ${isDragging ? "border-muted bg-searchBackground text-ink" : "border-border bg-bg text-muted hover:border-muted hover:bg-searchBackground hover:text-[#555555]"}`}
    >
      {preparing
        ? <><LoaderCircle className="mb-3 h-4 w-4 animate-spin" /><span className="text-sm font-medium text-ink">正在載入圖片…</span></>
          : previewUrl
          ? <div className={`flex h-full aspect-[3/2] w-auto max-w-full items-center justify-center overflow-hidden rounded-card ${imageFit === "contain" ? "bg-bg" : "bg-transparent"}`}>
            {/* Signed private Storage URLs and local object URLs cannot use a static Next Image host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="圖片預覽" className={`h-full w-full ${imageFit === "cover" ? "object-cover" : "object-contain"}`} />
          </div>
          : hasImage
            ? <div className="flex h-full aspect-[3/2] w-auto max-w-full flex-col items-center justify-center rounded-card bg-bg"><ImageUp className="mb-2 h-4 w-4" /><span className="text-sm font-medium text-ink">圖片預覽暫時無法載入</span><span className="mt-1 text-xs">仍可更換或移除圖片</span></div>
          : <><ImageUp className="mb-1 h-4 w-4" /><span className="font-medium text-ink">拖曳、貼上或選擇圖片</span><span className="mt-0.5 text-xs">可按 ⌘V / Ctrl+V 直接貼上</span><span className="mt-1 text-xs leading-4">JPG / PNG / WebP，原圖最大 20 MB<br />裁切後自動壓縮為 WebP 或 JPEG（最大 2 MB）</span></>}
    </button>
    {hasImage && <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-card border border-border bg-surface p-1" role="group" aria-label="圖片顯示方式">
        <button type="button" aria-pressed={imageFit === "cover"} disabled={busy} onClick={() => onFitChange("cover")} className={`rounded-[4px] px-3 py-1.5 text-xs transition-colors ${imageFit === "cover" ? "bg-searchBackground text-ink" : "text-muted hover:text-ink"}`}>裁切填滿</button>
        <button type="button" aria-pressed={imageFit === "contain"} disabled={busy} onClick={() => onFitChange("contain")} className={`rounded-[4px] px-3 py-1.5 text-xs transition-colors ${imageFit === "contain" ? "bg-searchBackground text-ink" : "text-muted hover:text-ink"}`}>完整顯示</button>
      </div>
      <div className="flex items-center gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void adjust()}>調整圖片</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>更換圖片</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}><Trash2 className="h-4 w-4" />移除圖片</Button></div>
    </div>}
  </div>
  <TravelItemImageCropDialog
    open={cropOpen}
    source={cropSource}
    onOpenChange={(nextOpen) => {
      setCropOpen(nextOpen);
      if (!nextOpen) setCropSource(undefined);
    }}
    onApply={(nextFile) => {
      if (cropSource) setEditableSource(cropSource);
      onFileChange(nextFile);
    }}
  /></>;
}

function resetInput(input: HTMLInputElement | null) {
  if (input) input.value = "";
}

function mimeFromPath(path: string) {
  return path.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
}

function withClipboardName(file: File) {
  if (file.name) return file;
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  return new File([file], `clipboard-image.${extension}`, { type: file.type, lastModified: Date.now() });
}

function getClipboardImageFile(clipboardData: DataTransfer | null) {
  const imageItem = Array.from(clipboardData?.items ?? []).find((item) => item.kind === "file" && item.type.startsWith("image/"));
  return imageItem?.getAsFile() ?? Array.from(clipboardData?.files ?? []).find((file) => file.type.startsWith("image/"));
}

function isTextPasteTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, [role="textbox"], [contenteditable]:not([contenteditable="false"])'));
}
