"use client";

import * as React from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Search,
  LogOut,
  CheckCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import {
  NotificationItem,
  NotificationType,
  NotificationsResponse,
} from "@/types/client";

export function Topbar() {
  const { data: session } = useSession();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);

  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);

  const merchantName = session?.user?.merchantName || "Kaveri Textiles Pvt. Ltd.";
  const userName = session?.user?.name || "Farhan Merchant";
  const userRole = session?.user?.role || "ADMIN";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  React.useEffect(() => {
    let isCancelled = false;

    async function loadNotifications() {
      try {
        const res = await fetch("/api/notifications?pageSize=10");
        if (res.ok && !isCancelled) {
          const data: NotificationsResponse = await res.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    }

    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleMarkRead(notification: NotificationItem) {
    if (!notification.read) {
      try {
        await fetch(`/api/notifications/${notification.id}/read`, {
          method: "POST",
        });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error("Error marking notification read:", err);
      }
    }

    // Navigate to relevant dashboard view
    setNotificationsOpen(false);
    if (
      notification.type === NotificationType.APPROVAL_REQUIRED ||
      notification.type === NotificationType.RECOVERY_SUCCESS
    ) {
      router.push("/dashboard/recovery");
    } else if (notification.type === NotificationType.PAYMENT_FAILURE) {
      router.push("/dashboard/payments");
    } else {
      router.push("/dashboard/audit-logs");
    }
  }

  async function handleMarkAllRead() {
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  }

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.RECOVERY_SUCCESS:
        return <CheckCircle2 className="h-4 w-4 text-recovery shrink-0" />;
      case NotificationType.APPROVAL_REQUIRED:
        return <Clock className="h-4 w-4 text-risk shrink-0" />;
      case NotificationType.PAYMENT_FAILURE:
      case NotificationType.RISK_ALERT:
        return <AlertTriangle className="h-4 w-4 text-danger shrink-0" />;
      case NotificationType.SYSTEM_UPDATE:
      default:
        return <Info className="h-4 w-4 text-ai shrink-0" />;
    }
  };

  const getNotificationBadge = (type: NotificationType) => {
    switch (type) {
      case NotificationType.RECOVERY_SUCCESS:
        return <Badge tone="recovery">Recovered</Badge>;
      case NotificationType.APPROVAL_REQUIRED:
        return <Badge tone="risk">Approval</Badge>;
      case NotificationType.PAYMENT_FAILURE:
        return <Badge tone="danger">Failed</Badge>;
      case NotificationType.RISK_ALERT:
        return <Badge tone="danger">Risk</Badge>;
      default:
        return <Badge tone="info">System</Badge>;
    }
  };

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

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            aria-label="Notifications"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setMenuOpen(false);
            }}
            className="relative flex h-8 w-8 items-center justify-center rounded-app text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-paper">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-10 z-50 w-80 sm:w-96 rounded-app border border-line bg-surface-raised shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-[13px] font-semibold text-ink">Notifications</h4>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-medium text-danger">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 text-[11.5px] font-medium text-ai hover:underline"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Notification List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-line">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-[12px] text-ink-muted">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleMarkRead(notif)}
                      className={`flex cursor-pointer items-start gap-3 p-3 text-left transition-colors hover:bg-surface ${
                        !notif.read ? "bg-surface/50" : ""
                      }`}
                    >
                      <div className="mt-0.5">{getNotificationIcon(notif.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p
                            className={`text-[12.5px] truncate ${
                              !notif.read ? "font-semibold text-ink" : "text-ink-muted"
                            }`}
                          >
                            {notif.title}
                          </p>
                          {getNotificationBadge(notif.type)}
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-ink-muted line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        <span className="mt-1 block text-[10.5px] text-ink-faint tabular">
                          {formatDateTime(notif.createdAt)}
                        </span>
                      </div>
                      {!notif.read && (
                        <span className="h-2 w-2 rounded-full bg-ai shrink-0 mt-1.5" />
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-line bg-surface p-2 text-center">
                <button
                  onClick={() => {
                    setNotificationsOpen(false);
                    router.push("/dashboard/audit-logs");
                  }}
                  className="text-[11.5px] font-medium text-ink-muted hover:text-ink"
                >
                  View full audit trail →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => {
              setMenuOpen(!menuOpen);
              setNotificationsOpen(false);
            }}
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
