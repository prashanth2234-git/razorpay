import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: string;
  subtitle?: string;
  delta?: number;
  deltaGoodDirection?: "up" | "down";
  icon?: React.ReactNode;
  tone?: "default" | "recovery" | "risk" | "danger" | "ai";
  className?: string;
}

export function Stat({
  label,
  value,
  subtitle,
  delta,
  deltaGoodDirection = "up",
  icon,
  tone = "default",
  className,
}: StatProps) {
  const isPositiveDelta = delta !== undefined && delta >= 0;
  const isGood =
    delta === undefined
      ? null
      : deltaGoodDirection === "up"
      ? isPositiveDelta
      : !isPositiveDelta;

  return (
    <div
      className={cn(
        "group flex flex-col justify-between gap-2 px-5 py-4 transition-colors hover:bg-slate-50/70",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-muted">{label}</span>
        {icon && (
          <div className="text-ink-faint transition-colors group-hover:text-ink">
            {icon}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span
          className={cn(
            "tabular text-[22px] font-bold leading-tight tracking-tight",
            tone === "recovery"
              ? "text-emerald-700"
              : tone === "risk"
              ? "text-amber-700"
              : tone === "danger"
              ? "text-rose-700"
              : tone === "ai"
              ? "text-indigo-700"
              : "text-ink"
          )}
        >
          {value}
        </span>

        {subtitle && (
          <span className="text-[11px] text-ink-faint">{subtitle}</span>
        )}
      </div>

      {delta !== undefined && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <span
            className={cn(
              "tabular inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.2 text-[11px] font-semibold",
              isGood
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            )}
          >
            {isPositiveDelta ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-[10.5px] text-ink-faint">vs last month</span>
        </div>
      )}
    </div>
  );
}

export function StatRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 divide-x divide-y sm:divide-y-0 divide-line rounded-app border border-line bg-surface-raised shadow-[0_1px_3px_rgba(0,0,0,0.03)] sm:grid-cols-3 lg:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}

