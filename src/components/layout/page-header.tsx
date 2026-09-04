import * as React from "react";

export function PageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] font-bold tracking-tight text-ink sm:text-[24px]">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-[13px] text-ink-muted leading-relaxed max-w-3xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}

