import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-app border border-line-strong bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-ai",
        className
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        "h-9 rounded-app border border-line-strong bg-surface-raised px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-ai",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";
