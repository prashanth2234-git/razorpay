"use client";

import { Bell, ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Topbar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface-raised px-5">
      <button className="flex items-center gap-2 rounded-app border border-line-strong px-2.5 py-1.5 text-[13px] font-medium text-ink hover:bg-surface">
        Kaveri Textiles Pvt. Ltd.
        <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
      </button>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            placeholder="Search payments, customers, pay_id…"
            className="h-8 w-full rounded-app border border-line bg-surface pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-ai"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge tone="ai" dot>
          Agent active
        </Badge>
        <button
          aria-label="Notifications"
          className="relative flex h-8 w-8 items-center justify-center rounded-app text-ink-muted hover:bg-surface hover:text-ink"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-paper">
          FM
        </button>
      </div>
    </header>
  );
}
