"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Receipt,
  Workflow,
  Users,
  Bot,
  BarChart3,
  ScrollText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/payments", label: "Payments", icon: Receipt },
  { href: "/dashboard/recovery", label: "Recovery", icon: Workflow },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/agent", label: "AI Agent", icon: Bot },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/audit-logs", label: "Audit Logs", icon: ScrollText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface-raised lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-line px-5">
        <span className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-ink text-[13px] font-semibold leading-none text-paper">
          R
        </span>
        <span className="text-[14px] font-semibold text-ink">RazorRecover</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-app px-3 py-2 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-ink text-paper"
                  : "text-ink-muted hover:bg-surface hover:text-ink"
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-5 py-3.5">
        <p className="text-[11.5px] text-ink-faint">
          Test Mode — no live funds move.
        </p>
      </div>
    </aside>
  );
}
