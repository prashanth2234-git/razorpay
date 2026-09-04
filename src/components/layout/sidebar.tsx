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
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    title: "OPERATIONS",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutGrid },
      { href: "/dashboard/payments", label: "Payments", icon: Receipt },
      { href: "/dashboard/recovery", label: "Recovery Queue", icon: Workflow },
      { href: "/dashboard/customers", label: "Customers", icon: Users },
    ],
  },
  {
    title: "INTELLIGENCE & AUDIT",
    items: [
      { href: "/dashboard/agent", label: "AI Recovery Agent", icon: Bot },
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/dashboard/audit-logs", label: "Audit Logs", icon: ScrollText },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface-raised lg:flex shadow-[1px_0_4px_rgba(0,0,0,0.02)]">
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between border-b border-line px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-gradient-to-br from-slate-900 to-indigo-950 text-[13px] font-bold text-white shadow-sm ring-1 ring-slate-800">
            R
          </div>
          <div className="flex flex-col">
            <span className="text-[13.5px] font-semibold leading-tight text-ink tracking-tight">
              RazorRecover
            </span>
            <span className="text-[10px] font-medium text-ink-faint">
              AI Payment Recovery
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 space-y-5 px-3 py-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-3 pb-1 text-[10.5px] font-semibold tracking-wider text-ink-faint">
              {group.title}
            </p>
            {group.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname?.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center justify-between rounded-app px-3 py-2 text-[13px] font-medium transition-all",
                    active
                      ? "bg-slate-900 text-white shadow-sm font-semibold"
                      : "text-ink-muted hover:bg-slate-100 hover:text-ink"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={cn(
                        "h-4 w-4 transition-colors",
                        active ? "text-indigo-300" : "text-ink-faint group-hover:text-ink"
                      )}
                      strokeWidth={active ? 2.2 : 1.8}
                    />
                    <span>{item.label}</span>
                  </div>
                  {active && (
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Environment Footer Banner */}
      <div className="border-t border-line bg-surface/50 p-3.5">
        <div className="flex items-center gap-2 rounded-app border border-line bg-surface-raised p-2.5 shadow-2xs">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11.5px] font-semibold text-ink flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Test Mode Active
            </span>
            <span className="text-[10px] text-ink-faint truncate">
              Zero live fund movement
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

