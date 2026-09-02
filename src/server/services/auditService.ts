import { db } from "@/lib/db";
import { ActorType, AuditEventType, Prisma } from "@prisma/client";

export interface GetAuditLogsOptions {
  page?: number;
  pageSize?: number;
  eventType?: AuditEventType;
  actorType?: ActorType;
  paymentId?: string;
}

export async function getAuditLogs(merchantId: string, options: GetAuditLogsOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 25));
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditLogWhereInput = {
    merchantId, // strictly merchant-scoped
    ...(options.eventType && { eventType: options.eventType }),
    ...(options.actorType && { actorType: options.actorType }),
    ...(options.paymentId && { paymentId: options.paymentId }),
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
            status: true,
          },
        },
        recoveryAction: {
          select: {
            id: true,
            actionType: true,
            status: true,
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

export async function createAuditLog(data: {
  merchantId: string;
  userId?: string;
  paymentId?: string;
  recoveryActionId?: string;
  actorType: ActorType;
  eventType: AuditEventType;
  description: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return db.auditLog.create({
    data: {
      merchantId: data.merchantId,
      userId: data.userId,
      paymentId: data.paymentId,
      recoveryActionId: data.recoveryActionId,
      actorType: data.actorType,
      eventType: data.eventType,
      description: data.description,
      metadata: data.metadata || Prisma.DbNull,
    },
  });
}
