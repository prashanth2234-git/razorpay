import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-app text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink/85",
        recovery: "bg-recovery text-white hover:bg-recovery/90",
        danger: "bg-danger text-white hover:bg-danger/90",
        outline:
          "border border-line-strong bg-surface-raised text-ink hover:bg-surface",
        ghost: "text-ink-muted hover:bg-surface hover:text-ink",
        subtle: "bg-surface text-ink hover:bg-line/60",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
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
