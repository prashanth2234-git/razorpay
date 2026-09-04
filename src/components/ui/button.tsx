import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-app text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99]",
  {
    variants: {
      variant: {
        primary: "bg-slate-900 text-white shadow-xs hover:bg-slate-800 hover:shadow-sm",
        recovery: "bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 hover:shadow-sm",
        danger: "bg-rose-600 text-white shadow-xs hover:bg-rose-700 hover:shadow-sm",
        outline:
          "border border-line bg-surface-raised text-ink shadow-2xs hover:bg-slate-50 hover:border-line-strong",
        ghost: "text-ink-muted hover:bg-slate-100 hover:text-ink",
        subtle: "bg-slate-100 text-ink hover:bg-slate-200/70",
      },
      size: {
        sm: "h-8 px-3 text-[12.5px]",
        md: "h-9 px-4 text-[13px]",
        lg: "h-10 px-5 text-[14px]",
        icon: "h-8.5 w-8.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

