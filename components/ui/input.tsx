import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "form-control h-[42px] w-full rounded-card border border-border bg-surface px-3 text-sm text-ink placeholder:text-[#cfcfcf]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "form-control w-full rounded-card border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-[#cfcfcf]",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
