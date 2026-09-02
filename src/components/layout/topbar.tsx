"use client";

import * as React from "react";
import { useSession, signOut } from "next-auth/react";
import { Bell, ChevronDown, Search, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Topbar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const merchantName = session?.user?.merchantName || "Kaveri Textiles Pvt. Ltd.";
  const userName = session?.user?.name || "Farhan Merchant";
  const userRole = session?.user?.role || "ADMIN";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface-raised px-5">
      {/* Merchant Switcher */}
      <button className="flex items-center gap-2 rounded-app border border-line-strong px-2.5 py-1.5 text-[13px] font-medium text-ink hover:bg-surface">
        <span>{merchantName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
      </button>

      {/* Global Search */}
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

      {/* Header Actions & Profile */}
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

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-8 items-center gap-2 rounded-full border border-line-strong bg-surface px-1.5 py-1 text-[12px] font-medium text-ink hover:bg-line/40"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-paper">
              {initials}
            </span>
            <span className="hidden pr-1 font-medium sm:inline">{userName.split(" ")[0]}</span>
            <ChevronDown className="h-3 w-3 text-ink-faint" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 z-50 w-56 rounded-app border border-line bg-surface-raised p-2 shadow-lg">
              <div className="border-b border-line px-2 pb-2 pt-1">
                <p className="text-[13px] font-semibold text-ink">{userName}</p>
                <p className="text-[11.5px] text-ink-muted">{session?.user?.email || "operator@kaveri.in"}</p>
                <div className="mt-1.5">
                  <Badge
                    tone={
                      userRole === "ADMIN"
                        ? "recovery"
                        : userRole === "OPERATOR"
                        ? "ai"
                        : "neutral"
                    }
                  >
                    Role: {userRole}
                  </Badge>
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex w-full items-center gap-2 rounded-app px-2 py-1.5 text-left text-[12.5px] text-danger hover:bg-danger-soft"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
