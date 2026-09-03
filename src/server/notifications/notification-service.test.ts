import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createNotification,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notification-service";
import { db } from "@/lib/db";
import { NotificationType } from "@prisma/client";

// Mock db
vi.mock("@/lib/db", () => ({
  db: {
    notification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

type MockFn = {
  mockImplementation: (fn: (...args: unknown[]) => unknown) => void;
  mockResolvedValue: (val: unknown) => void;
  mockResolvedValueOnce: (val: unknown) => void;
};

describe("Notification Service (Milestone 7 Step 12A)", () => {
  const merchantId = "merch_demo_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Notification creation
  it("creates a notification with merchant scoping", async () => {
    (db.notification.findFirst as unknown as MockFn).mockResolvedValue(null); // No recent duplicate
    (db.notification.create as unknown as MockFn).mockResolvedValue({
      id: "notif_1",
      merchantId,
      type: NotificationType.APPROVAL_REQUIRED,
      title: "Approval Required: ₹1,500",
      message: "Operator sign-off required for payment pay_123",
      read: false,
    });

    const notif = await createNotification({
      merchantId,
      type: NotificationType.APPROVAL_REQUIRED,
      title: "Approval Required: ₹1,500",
      message: "Operator sign-off required for payment pay_123",
    });

    expect(notif.id).toBe("notif_1");
    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId,
        type: NotificationType.APPROVAL_REQUIRED,
      }),
    });
  });

  // 2. Deduplication / Idempotency
  it("prevents creating duplicate notifications within the recent time window", async () => {
    const existingNotification = {
      id: "notif_existing",
      merchantId,
      type: NotificationType.PAYMENT_FAILURE,
      title: "Payment Failed: ₹2,000",
      message: "Payment pay_456 failed",
      createdAt: new Date(),
    };

    (db.notification.findFirst as unknown as MockFn).mockResolvedValue(
      existingNotification
    );

    const result = await createNotification({
      merchantId,
      type: NotificationType.PAYMENT_FAILURE,
      title: "Payment Failed: ₹2,000",
      message: "Payment pay_456 failed",
    });

    expect(result.id).toBe("notif_existing");
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  // 3. Querying unread notifications
  it("retrieves paginated notifications and accurate unread count", async () => {
    (db.notification.count as unknown as MockFn).mockResolvedValueOnce(15); // total
    (db.notification.count as unknown as MockFn).mockResolvedValueOnce(3); // unreadCount

    (db.notification.findMany as unknown as MockFn).mockResolvedValue([
      {
        id: "notif_1",
        merchantId,
        type: NotificationType.APPROVAL_REQUIRED,
        title: "Approval Required",
        read: false,
      },
    ]);

    const result = await getNotifications(merchantId, { page: 1, pageSize: 10 });

    expect(result.total).toBe(15);
    expect(result.unreadCount).toBe(3);
    expect(result.notifications.length).toBe(1);
    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ merchantId }),
        orderBy: { createdAt: "desc" },
      })
    );
  });

  // 4. Mark single notification as read (Strict merchant isolation)
  it("marks notification as read only if it belongs to the authenticated merchant", async () => {
    (db.notification.findFirst as unknown as MockFn).mockResolvedValue({
      id: "notif_1",
      merchantId,
    });
    (db.notification.update as unknown as MockFn).mockResolvedValue({
      id: "notif_1",
      read: true,
    });

    const updated = await markNotificationRead("notif_1", merchantId);

    expect(updated?.read).toBe(true);
    expect(db.notification.findFirst).toHaveBeenCalledWith({
      where: { id: "notif_1", merchantId },
    });
    expect(db.notification.update).toHaveBeenCalledWith({
      where: { id: "notif_1" },
      data: { read: true },
    });
  });

  // 5. Reject marking notification belonging to another merchant
  it("returns null when attempting to mark another merchant's notification as read", async () => {
    (db.notification.findFirst as unknown as MockFn).mockResolvedValue(null);

    const result = await markNotificationRead("notif_other", merchantId);

    expect(result).toBeNull();
    expect(db.notification.update).not.toHaveBeenCalled();
  });

  // 6. Mark all as read
  it("marks all unread notifications as read for the merchant", async () => {
    (db.notification.updateMany as unknown as MockFn).mockResolvedValue({
      count: 4,
    });

    const result = await markAllNotificationsRead(merchantId);

    expect(result.count).toBe(4);
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { merchantId, read: false },
      data: { read: true },
    });
  });
});
