"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  className,
  children,
  title,
  preventOutsideDismiss = false,
  onInteractOutside,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; preventOutsideDismiss?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-40 bg-black/30 data-[state=closed]:animate-dialogOverlayOut data-[state=open]:animate-dialogOverlayIn"
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2",
          "rounded-card bg-surface p-6 shadow-pop",
          "data-[state=closed]:animate-dialogContentOut data-[state=open]:animate-dialogContentIn",
          "max-h-[85vh] overflow-y-auto",
          className
        )}
        onInteractOutside={(event) => {
          onInteractOutside?.(event);
          if (preventOutsideDismiss) event.preventDefault();
        }}
        {...props}
      >
        <div className="mb-4 flex items-center justify-between">
          <DialogPrimitive.Title className="text-title font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close aria-label="關閉" title="關閉" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg sm:h-9 sm:w-9">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
