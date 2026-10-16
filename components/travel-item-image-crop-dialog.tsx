"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cropTravelItemImage, TRAVEL_ITEM_IMAGE_ASPECT } from "@/lib/travel-item-image";

const MAX_ZOOM = 3;

type Size = { width: number; height: number };
type Position = { x: number; y: number };

export function TravelItemImageCropDialog({ open, source, onOpenChange, onApply }: {
  open: boolean;
  source?: File;
  onOpenChange: (open: boolean) => void;
  onApply: (file: File) => void;
}) {
  const dragRef = useRef<{ pointerId: number; x: number; y: number; position: Position } | undefined>(undefined);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 });
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open || !source) {
      setSourceUrl(undefined);
      return;
    }
    const nextUrl = URL.createObjectURL(source);
    setSourceUrl(nextUrl);
    setImageSize({ width: 0, height: 0 });
    setPosition({ x: 0, y: 0 });
    setZoom(1);
    setProcessing(false);
    return () => URL.revokeObjectURL(nextUrl);
  }, [open, source]);

  useLayoutEffect(() => {
    const viewport = viewportElement;
    if (!open || !viewport) return;
    const measure = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [open, viewportElement]);

  useEffect(() => {
    setPosition((current) => clampPosition(current, imageSize, viewportSize, zoom));
  }, [imageSize, viewportSize, zoom]);

  const reset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };
  const moveTo = (next: Position) => setPosition(clampPosition(next, imageSize, viewportSize, zoom));
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!imageSize.width || processing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, position };
    setDragging(true);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    moveTo({ x: drag.position.x + event.clientX - drag.x, y: drag.position.y + event.clientY - drag.y });
  };
  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const directions: Record<string, Position> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const distance = event.shiftKey ? 10 : 2;
    moveTo({ x: position.x + direction.x * distance, y: position.y + direction.y * distance });
  };
  const apply = async () => {
    if (!source || !imageSize.width || !viewportSize.width || processing) return;
    const scale = coverScale(imageSize, viewportSize) * zoom;
    const cropWidth = viewportSize.width / scale;
    const cropHeight = cropWidth / TRAVEL_ITEM_IMAGE_ASPECT;
    const cropX = imageSize.width / 2 - cropWidth / 2 - position.x / scale;
    const cropY = imageSize.height / 2 - cropHeight / 2 - position.y / scale;
    setProcessing(true);
    try {
      const file = await cropTravelItemImage(source, {
        x: Math.max(0, Math.min(cropX, imageSize.width - cropWidth)),
        y: Math.max(0, Math.min(cropY, imageSize.height - cropHeight)),
        width: cropWidth,
        height: cropHeight,
      });
      onApply(file);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "圖片裁切失敗");
    } finally {
      setProcessing(false);
    }
  };

  const scale = coverScale(imageSize, viewportSize) * zoom;
  const renderedWidth = imageSize.width * scale;
  const renderedHeight = imageSize.height * scale;

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!processing) onOpenChange(nextOpen); }}>
    <DialogContent title="調整圖片" className="max-w-2xl" preventOutsideDismiss onEscapeKeyDown={(event) => { if (processing) event.preventDefault(); }}>
      <div className="space-y-5">
        <p className="text-xs leading-relaxed text-muted">拖曳圖片調整顯示範圍，卡片會使用框內的 3:2 畫面。</p>
        <div
          ref={setViewportElement}
          role="application"
          tabIndex={0}
          aria-label="圖片裁切範圍，可拖曳圖片或使用方向鍵調整位置"
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          className={`relative aspect-[3/2] w-full touch-none overflow-hidden rounded-card bg-searchBackground outline-none ring-offset-2 focus-visible:ring-1 focus-visible:ring-ink ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
          {/* Local object URLs cannot use a static Next Image source. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {sourceUrl && <img
            src={sourceUrl}
            alt="裁切預覽"
            draggable={false}
            onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none will-change-transform"
            style={{
              width: renderedWidth || undefined,
              height: renderedHeight || undefined,
              transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)`,
            }}
          />}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-card ring-1 ring-inset ring-surface/70" />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="travel-item-image-zoom" className="shrink-0 text-xs font-medium text-ink">縮放</label>
          <input
            id="travel-item-image-zoom"
            type="range"
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            disabled={processing || !imageSize.width}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-10 min-w-0 flex-1 accent-ink"
          />
          <span className="w-10 text-right text-xs tabular-nums text-muted">{zoom.toFixed(1)}×</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" disabled={processing} onClick={reset}><RotateCcw className="h-4 w-4" />重設</Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" disabled={processing} onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="button" disabled={processing || !imageSize.width} onClick={() => void apply()}>{processing ? "處理中…" : "套用裁切"}</Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

function coverScale(image: Size, viewport: Size) {
  if (!image.width || !image.height || !viewport.width || !viewport.height) return 0;
  return Math.max(viewport.width / image.width, viewport.height / image.height);
}

function clampPosition(position: Position, image: Size, viewport: Size, zoom: number) {
  const scale = coverScale(image, viewport) * zoom;
  if (!scale) return { x: 0, y: 0 };
  const maxX = Math.max(0, (image.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (image.height * scale - viewport.height) / 2);
  return {
    x: Math.max(-maxX, Math.min(position.x, maxX)),
    y: Math.max(-maxY, Math.min(position.y, maxY)),
  };
}
