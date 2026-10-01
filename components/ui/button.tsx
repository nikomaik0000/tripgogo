import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-card text-xs font-medium tracking-[0.1em] transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "border border-ink bg-ink text-bg hover:bg-black",
        // Quiet neutral primary action used by shared forms and dialogs.
        primary: "border border-border bg-accentSoft text-ink hover:bg-[#eeeeee]",
        outline:
          "border border-border bg-surface text-ink hover:bg-searchBackground",
        ghost: "bg-transparent text-ink hover:bg-searchBackground",
        accent: "bg-accent-green text-white hover:opacity-90",
        destructive: "bg-red-400/90 text-white hover:bg-red-500",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3 text-xs",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
