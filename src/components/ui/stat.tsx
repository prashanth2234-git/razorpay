import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: string;
  delta?: number;
  deltaGoodDirection?: "up" | "down";
  className?: string;
}

export function Stat({
  label,
  value,
  delta,
  deltaGoodDirection = "up",
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
    <div className={cn("flex flex-col gap-2 px-5 py-4", className)}>
      <span className="text-[12.5px] text-ink-muted">{label}</span>
      <span className="tabular text-[22px] font-semibold leading-none text-ink">
        {value}
      </span>
      {delta !== undefined && (
        <span
          className={cn(
            "tabular inline-flex w-fit items-center gap-0.5 text-[12.5px] font-medium",
            isGood ? "text-recovery" : "text-danger"
          )}
        >
          {isPositiveDelta ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {Math.abs(delta).toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-line rounded-app border border-line bg-surface-raised sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
      {children}
    </div>
  );
}
