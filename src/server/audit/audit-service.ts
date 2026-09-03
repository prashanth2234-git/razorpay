import { db } from "@/lib/db";
import { ActorType, AuditEventType, Prisma } from "@prisma/client";

export interface GetAuditLogsOptions {
  page?: number;
  pageSize?: number;
  eventType?: AuditEventType;
  actorType?: ActorType;
  paymentId?: string;
  recoveryActionId?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  search?: string;
}

export interface CreateAuditLogInput {
  merchantId: string;
  userId?: string | null;
  paymentId?: string | null;
  recoveryActionId?: string | null;
  actorType: ActorType;
  eventType: AuditEventType;
  description: string;
  metadata?: Record<string, unknown> | Prisma.InputJsonValue | null;
}

/**
 * Sanitizes metadata objects before writing to immutable audit log.
 * Strips any sensitive credentials, tokens, keys, passwords, or secrets.
 */
export function sanitizeAuditMetadata(
  meta: Record<string, unknown> | Prisma.InputJsonValue | null | undefined
): Prisma.InputJsonValue | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return (meta as Prisma.InputJsonValue) || undefined;
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveKeyRegex = /secret|password|token|key|cookie|auth|authorization|bearer|signature/i;

  for (const [key, value] of Object.entries(meta)) {
    if (sensitiveKeyRegex.test(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as Prisma.InputJsonValue;
}

/**
 * Creates an immutable audit log entry.
 *
 * SAFETY INVARIANTS:
 * - Strictly requires merchantId from verified server context.
 * - Always sanitizes metadata to prevent secret leakage.
 * - All financial values in metadata remain in integer paise.
 */
export async function createAuditLog(data: CreateAuditLogInput) {
  if (!data.merchantId) {
    throw new Error("createAuditLog requires a verified merchantId");
  }

  const safeMetadata = sanitizeAuditMetadata(data.metadata);

  return db.auditLog.create({
    data: {
      merchantId: data.merchantId,
      userId: data.userId || null,
      paymentId: data.paymentId || null,
      recoveryActionId: data.recoveryActionId || null,
      actorType: data.actorType,
      eventType: data.eventType,
      description: data.description,
      metadata: safeMetadata || Prisma.DbNull,
    },
  });
}

/**
 * Retrieves paginated audit logs for a specific merchant.
 */
export async function getAuditLogs(
  merchantId: string,
  options: GetAuditLogsOptions = {}
) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 25));
  const skip = (page - 1) * pageSize;

  const startDate = options.startDate ? new Date(options.startDate) : undefined;
  const endDate = options.endDate ? new Date(options.endDate) : undefined;

  const dateFilter =
    startDate || endDate
      ? {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        }
      : undefined;

  const where: Prisma.AuditLogWhereInput = {
    merchantId, // strictly merchant-scoped
    ...(options.eventType ? { eventType: options.eventType } : {}),
    ...(options.actorType ? { actorType: options.actorType } : {}),
    ...(options.paymentId ? { paymentId: options.paymentId } : {}),
    ...(options.recoveryActionId ? { recoveryActionId: options.recoveryActionId } : {}),
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...(options.search
      ? {
          OR: [
            { description: { contains: options.search, mode: "insensitive" } },
            { paymentId: { contains: options.search, mode: "insensitive" } },
            { recoveryActionId: { contains: options.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, auditLogs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        payment: {
          select: {
            id: true,
            providerPaymentId: true,
            amount: true,
            currency: true,
            status: true,
            failureCategory: true,
            customer: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        recoveryAction: {
          select: {
            id: true,
            actionType: true,
            status: true,
            expectedRecoveryAmount: true,
          },
        },
      },
    }),
  ]);

  return {
    auditLogs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
