import { db } from "@/lib/db";
import { NotificationType, Prisma } from "@prisma/client";

export interface CreateNotificationInput {
  merchantId: string;
  customerId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | Prisma.InputJsonValue | null;
  dedupKey?: string; // Optional deduplication key
}

export interface GetNotificationsOptions {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
}

/**
 * Creates a merchant-scoped notification with idempotency protection.
 */
export async function createNotification(data: CreateNotificationInput) {
  if (!data.merchantId) {
    throw new Error("createNotification requires a verified merchantId");
  }

  // Idempotency check: prevent duplicate notifications created within a 15-minute window for the same title/type
  const recentWindow = new Date(Date.now() - 15 * 60 * 1000);
  const existing = await db.notification.findFirst({
    where: {
      merchantId: data.merchantId,
      type: data.type,
      title: data.title,
      createdAt: { gte: recentWindow },
    },
  });

  if (existing) {
    return existing;
  }

  return db.notification.create({
    data: {
      merchantId: data.merchantId,
      customerId: data.customerId || null,
      type: data.type,
      title: data.title,
      message: data.message,
      metadata: (data.metadata as Prisma.InputJsonValue) || Prisma.DbNull,
    },
  });
}

/**
 * Retrieves paginated notifications for an authenticated merchant.
 */
export async function getNotifications(
  merchantId: string,
  options: GetNotificationsOptions = {}
) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize || 10));
  const skip = (page - 1) * pageSize;

  const where: Prisma.NotificationWhereInput = {
    merchantId, // strictly merchant-scoped
    ...(options.unreadOnly ? { read: false } : {}),
    ...(options.type ? { type: options.type } : {}),
  };

  const [total, unreadCount, notifications] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({
      where: {
        merchantId,
        read: false,
      },
    }),
    db.notification.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    notifications,
    unreadCount,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Marks a notification as read, ensuring strict merchant isolation.
 */
export async function markNotificationRead(
  notificationId: string,
  merchantId: string
) {
  // Ensure the notification belongs to this merchant
  const notification = await db.notification.findFirst({
    where: {
      id: notificationId,
      merchantId,
    },
  });

  if (!notification) {
    return null;
  }

  return db.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

/**
 * Marks all notifications as read for a merchant.
 */
export async function markAllNotificationsRead(merchantId: string) {
  return db.notification.updateMany({
    where: {
      merchantId,
      read: false,
    },
    data: { read: true },
  });
}
