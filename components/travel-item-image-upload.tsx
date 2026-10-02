"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { travelRepository } from "@/lib/travel-repository";
import { compressTravelItemImage } from "@/lib/travel-item-image";
import type { TravelItemImageFit } from "@/lib/types";

const SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function TravelItemImageUpload({ file, imagePath, imageFit, disabled = false, onFileChange, onRemove, onFitChange }: {
  file?: File;
  imagePath?: string;
  imageFit: TravelItemImageFit;
  disabled?: boolean;
  onFileChange: (file: File) => void;
  onRemove: () => void;
  onFitChange: (fit: TravelItemImageFit) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();

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

  const choose = async (nextFile?: File) => {
    if (!nextFile || disabled || compressing) return;
    if (!SOURCE_TYPES.has(nextFile.type)) {
      toast.error("圖片格式僅支援 JPG、PNG 或 WebP");
      resetInput(inputRef.current);
      return;
    }
    if (nextFile.size > SOURCE_MAX_BYTES) {
      toast.error("原始圖片大小不可超過 20 MB");
      resetInput(inputRef.current);
      return;
    }
    setCompressing(true);
    try {
      onFileChange(await compressTravelItemImage(nextFile));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "圖片處理失敗");
      resetInput(inputRef.current);
    } finally {
      setCompressing(false);
    }
  };

  const remove = () => {
    resetInput(inputRef.current);
    onRemove();
  };
  const busy = disabled || compressing;
  const hasImage = Boolean(file || imagePath);

  return <div className="min-w-0 space-y-3">
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} className="sr-only" disabled={busy} onChange={(event) => void choose(event.target.files?.[0])} />
    <button
      type="button"
      disabled={busy}
      aria-label={hasImage ? "更換圖片" : "選擇或拖曳圖片"}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setIsDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setIsDragging(false); }}
      onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setIsDragging(false); void choose(event.dataTransfer.files[0]); }}
      className={`flex h-[140px] min-h-[140px] w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-card border border-dashed text-center transition-colors disabled:cursor-wait ${hasImage ? "p-0" : "px-4 py-2"} ${isDragging ? "border-muted bg-searchBackground text-ink" : "border-border bg-bg text-muted hover:border-muted hover:bg-searchBackground hover:text-[#555555]"}`}
    >
      {compressing
        ? <><LoaderCircle className="mb-3 h-4 w-4 animate-spin" /><span className="text-sm font-medium text-ink">正在壓縮圖片…</span></>
          : previewUrl
          ? <div className={`flex h-full aspect-[3/2] w-auto max-w-full items-center justify-center overflow-hidden rounded-card ${imageFit === "contain" ? "bg-bg" : "bg-transparent"}`}>
            {/* Signed private Storage URLs and local object URLs cannot use a static Next Image host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="圖片預覽" className={`h-full w-full ${imageFit === "cover" ? "object-cover" : "object-contain"}`} />
          </div>
          : hasImage
            ? <div className="flex h-full aspect-[3/2] w-auto max-w-full flex-col items-center justify-center rounded-card bg-bg"><ImageUp className="mb-2 h-4 w-4" /><span className="text-sm font-medium text-ink">圖片預覽暫時無法載入</span><span className="mt-1 text-xs">仍可更換或移除圖片</span></div>
          : <><ImageUp className="mb-1 h-4 w-4" /><span className="font-medium text-ink">拖曳圖片到這裡</span><span className="mt-0.5 text-xs">或點擊選擇圖片</span><span className="mt-1 text-xs leading-4">JPG / PNG / WebP，原圖最大 20 MB<br />儲存前自動壓縮為 WebP（最大 2 MB）</span></>}
    </button>
    {hasImage && <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-card border border-border bg-surface p-1" role="group" aria-label="圖片顯示方式">
        <button type="button" aria-pressed={imageFit === "cover"} disabled={busy} onClick={() => onFitChange("cover")} className={`rounded-[4px] px-3 py-1.5 text-xs transition-colors ${imageFit === "cover" ? "bg-searchBackground text-ink" : "text-muted hover:text-ink"}`}>裁切填滿</button>
        <button type="button" aria-pressed={imageFit === "contain"} disabled={busy} onClick={() => onFitChange("contain")} className={`rounded-[4px] px-3 py-1.5 text-xs transition-colors ${imageFit === "contain" ? "bg-searchBackground text-ink" : "text-muted hover:text-ink"}`}>完整顯示</button>
      </div>
      <div className="flex items-center gap-2"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>更換圖片</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}><Trash2 className="h-4 w-4" />移除圖片</Button></div>
    </div>}
  </div>;
}

function resetInput(input: HTMLInputElement | null) {
  if (input) input.value = "";
}
