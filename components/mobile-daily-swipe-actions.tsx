"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { SquarePen, Trash2 } from "lucide-react";

const ACTION_SLOT_WIDTH = 56;
const DIRECTION_LOCK_THRESHOLD = 12;
const HORIZONTAL_DOMINANCE = 1.25;

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
  return <MobileSwipeActions itemId={itemId} canEdit={enabled} canDelete={enabled} open={open} dragging={dragging} onOpen={onOpen} onClose={onClose} onEdit={onEdit} onDelete={onDelete}>{children}</MobileSwipeActions>;
}

export function MobileSwipeActions({ itemId, canEdit, canDelete, open, dragging = false, desktopPassthrough = false, mobileFrame = false, onOpen, onClose, onEdit, onDelete, children, className = "" }: {
  itemId: string;
  canEdit: boolean;
  canDelete: boolean;
  open: boolean;
  dragging?: boolean;
  desktopPassthrough?: boolean;
  mobileFrame?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: ReactNode;
  className?: string;
}) {
  const actionCount = Number(canEdit) + Number(canDelete);
  const actionRailWidth = actionCount * ACTION_SLOT_WIDTH;
  const enabled = actionCount > 0;
  const gesture = useRef<Gesture | undefined>(undefined);
  const [offset, setOffset] = useState(open ? -actionRailWidth : 0);
  const [swiping, setSwiping] = useState(false);

  useEffect(() => {
    if (!gesture.current) setOffset(open ? -actionRailWidth : 0);
  }, [actionRailWidth, open]);

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
      startOffset: open ? -actionRailWidth : 0,
      currentOffset: open ? -actionRailWidth : 0,
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
    current.currentOffset = Math.min(0, Math.max(-actionRailWidth, current.startOffset + deltaX));
    setOffset(current.currentOffset);
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = undefined;
    setSwiping(false);
    if (current.direction === "horizontal" && !cancelled) {
      const nextOpen = current.currentOffset <= -actionRailWidth / 2;
      setOffset(nextOpen ? -actionRailWidth : 0);
      if (nextOpen) onOpen();
      else onClose();
      return;
    }
    setOffset(open ? -actionRailWidth : 0);
    if (current.direction === "pending" && open) onClose();
  };

  return <div data-mobile-swipe-card={itemId} className={`relative overflow-hidden rounded-card ${mobileFrame ? "border border-border bg-surface shadow-soft" : ""} ${desktopPassthrough ? "sm:contents" : "sm:hidden"} ${className}`}>
    {enabled && <div aria-hidden={!open} className="absolute inset-y-0 right-0 flex border-l border-divider/60 bg-surface sm:hidden" style={{ width: actionRailWidth }}>
      {canEdit && <button type="button" aria-label="編輯" title="編輯" tabIndex={open ? 0 : -1} data-no-dnd onClick={() => { onClose(); onEdit(); }} className={`flex w-14 items-center justify-center bg-searchBackground text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${canDelete ? "border-r border-divider/60" : ""}`}><SquarePen className="h-4 w-4" /></button>}
      {canDelete && <button type="button" aria-label="刪除" title="刪除" tabIndex={open ? 0 : -1} data-no-dnd onClick={() => { onClose(); onDelete(); }} className="flex w-14 items-center justify-center bg-surface text-[#8a666d] transition-colors hover:bg-[#f9f4f5] hover:text-[#5f3f46] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"><Trash2 className="h-4 w-4" /></button>}
    </div>}
    <div
      className={`relative touch-pan-y bg-surface ${desktopPassthrough ? "sm:contents" : ""}`}
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
  return isMobileSwipeInteractiveTarget(target);
}

export function isMobileSwipeInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a, button, input, textarea, select, [data-no-dnd]"));
}

export function useMobileSwipeGroup() {
  const [openItemId, setOpenItemId] = useState<string>();
  useEffect(() => {
    if (!openItemId) return;
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      const card = target instanceof Element ? target.closest("[data-mobile-swipe-card]") : null;
      if (card?.getAttribute("data-mobile-swipe-card") !== openItemId) setOpenItemId(undefined);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [openItemId]);
  const close = useCallback(() => setOpenItemId(undefined), []);
  return { openItemId, open: setOpenItemId, close };
}
