import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11.5px] font-semibold leading-none tracking-tight transition-colors",
  {
    variants: {
      tone: {
        neutral: "border-slate-200 bg-slate-100/80 text-slate-700",
        recovery: "border-emerald-200/80 bg-emerald-50 text-emerald-700",
        risk: "border-amber-200/80 bg-amber-50 text-amber-800",
        danger: "border-rose-200/80 bg-rose-50 text-rose-700",
        ai: "border-indigo-200/80 bg-indigo-50 text-indigo-700",
        info: "border-blue-200/80 bg-blue-50 text-blue-700",
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
            tone === "recovery" && "bg-emerald-600",
            tone === "risk" && "bg-amber-600",
            tone === "danger" && "bg-rose-600",
            tone === "ai" && "bg-indigo-600",
            tone === "info" && "bg-blue-600",
            (!tone || tone === "neutral") && "bg-slate-400"
          )}
        />
      )}
      {children}
    </span>
  );
}

