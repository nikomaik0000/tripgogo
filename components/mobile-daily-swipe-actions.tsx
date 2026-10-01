"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { SquarePen, Trash2 } from "lucide-react";

const ACTION_RAIL_WIDTH = 112;
const DIRECTION_LOCK_THRESHOLD = 12;
const HORIZONTAL_DOMINANCE = 1.25;
const SNAP_THRESHOLD = ACTION_RAIL_WIDTH / 2;

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: number;
  currentOffset: number;
  direction: "pending" | "horizontal" | "vertical";
};

export function MobileDailySwipeActions({ itemId, enabled, open, dragging, onOpen, onClose, onEdit, onDelete, children }: {
  itemId: string;
  enabled: boolean;
  open: boolean;
  dragging: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const gesture = useRef<Gesture | undefined>(undefined);
  const [offset, setOffset] = useState(open ? -ACTION_RAIL_WIDTH : 0);
  const [swiping, setSwiping] = useState(false);

  useEffect(() => {
    if (!gesture.current) setOffset(open ? -ACTION_RAIL_WIDTH : 0);
  }, [open]);

  useEffect(() => {
    if (!dragging) return;
    gesture.current = undefined;
    setSwiping(false);
    setOffset(0);
    if (open) onClose();
  }, [dragging, onClose, open]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || dragging || event.pointerType !== "touch" || isDailyCardInteractiveTarget(event.target)) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: open ? -ACTION_RAIL_WIDTH : 0,
      currentOffset: open ? -ACTION_RAIL_WIDTH : 0,
      direction: "pending",
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || dragging) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (current.direction === "pending") {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DIRECTION_LOCK_THRESHOLD) return;
      if (Math.abs(deltaX) > Math.abs(deltaY) * HORIZONTAL_DOMINANCE) {
        current.direction = "horizontal";
        setSwiping(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else {
        current.direction = "vertical";
        return;
      }
    }
    if (current.direction !== "horizontal") return;
    event.preventDefault();
    current.currentOffset = Math.min(0, Math.max(-ACTION_RAIL_WIDTH, current.startOffset + deltaX));
    setOffset(current.currentOffset);
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = undefined;
    setSwiping(false);
    if (current.direction === "horizontal" && !cancelled) {
      const nextOpen = current.currentOffset <= -SNAP_THRESHOLD;
      setOffset(nextOpen ? -ACTION_RAIL_WIDTH : 0);
      if (nextOpen) onOpen();
      else onClose();
      return;
    }
    setOffset(open ? -ACTION_RAIL_WIDTH : 0);
    if (current.direction === "pending" && open) onClose();
  };

  return <div data-mobile-swipe-card={itemId} className="relative overflow-hidden rounded-card sm:hidden">
    <div aria-hidden={!open} className="absolute inset-y-0 right-0 flex w-28 border-l border-divider/60 bg-surface">
      <button type="button" aria-label="編輯" title="編輯" tabIndex={open ? 0 : -1} data-no-dnd onClick={() => { onClose(); onEdit(); }} className="flex w-14 items-center justify-center border-r border-divider/60 bg-searchBackground text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"><SquarePen className="h-4 w-4" /></button>
      <button type="button" aria-label="刪除" title="刪除" tabIndex={open ? 0 : -1} data-no-dnd onClick={() => { onClose(); onDelete(); }} className="flex w-14 items-center justify-center bg-surface text-[#8a666d] transition-colors hover:bg-[#f9f4f5] hover:text-[#5f3f46] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"><Trash2 className="h-4 w-4" /></button>
    </div>
    <div
      className="relative touch-pan-y bg-surface"
      style={{ transform: `translate3d(${offset}px, 0, 0)`, transition: swiping ? "none" : "transform 180ms ease-out" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishGesture(event)}
      onPointerCancel={(event) => finishGesture(event, true)}
    >
      {children}
    </div>
  </div>;
}

export function isDailyCardInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a, button, input, textarea, select, [data-no-dnd]"));
}
