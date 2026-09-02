import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-app border px-2 py-0.5 text-[12px] font-medium leading-5",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-surface text-ink-muted",
        recovery: "border-recovery/25 bg-recovery-soft text-recovery",
        risk: "border-risk/25 bg-risk-soft text-risk",
        danger: "border-danger/25 bg-danger-soft text-danger",
        ai: "border-ai/25 bg-ai-soft text-ai",
        info: "border-info/25 bg-info-soft text-info",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "recovery" && "bg-recovery",
            tone === "risk" && "bg-risk",
            tone === "danger" && "bg-danger",
            tone === "ai" && "bg-ai",
            tone === "info" && "bg-info",
            (!tone || tone === "neutral") && "bg-ink-faint"
          )}
        />
      )}
      {children}
    </span>
  );
}
