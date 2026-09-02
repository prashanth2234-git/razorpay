import { db } from "@/lib/db";
import { RecoveryStatus, RecoveryActionType, Prisma } from "@prisma/client";

export interface GetRecoveryActionsOptions {
  page?: number;
  pageSize?: number;
  status?: RecoveryStatus;
  actionType?: RecoveryActionType;
}

export async function getRecoveryActions(merchantId: string, options: GetRecoveryActionsOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.RecoveryActionWhereInput = {
    payment: {
      merchantId, // strictly merchant-scoped
    },
    ...(options.status && { status: options.status }),
    ...(options.actionType && { actionType: options.actionType }),
  };

  const [total, recoveryActions] = await Promise.all([
    db.recoveryAction.count({ where }),
    db.recoveryAction.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        payment: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        aiAnalysis: true,
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        attempts: {
          orderBy: { attemptNumber: "desc" },
        },
      },
    }),
  ]);

  return {
    recoveryActions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getRecoverySummary(merchantId: string) {
  const [totalActions, executed, pendingApproval, failed] = await Promise.all([
    db.recoveryAction.count({
      where: { payment: { merchantId } },
    }),
    db.recoveryAction.count({
      where: { payment: { merchantId }, status: RecoveryStatus.EXECUTED },
    }),
    db.recoveryAction.count({
      where: { payment: { merchantId }, status: RecoveryStatus.PENDING_APPROVAL },
    }),
    db.recoveryAction.count({
      where: { payment: { merchantId }, status: RecoveryStatus.FAILED },
    }),
  ]);

  const recoveredSumResult = await db.recoveryAttempt.aggregate({
    where: {
      recoveryAction: { payment: { merchantId } },
      status: RecoveryStatus.EXECUTED,
    },
    _sum: {
      recoveredAmount: true,
    },
  });

  return {
    totalActions,
    executed,
    pendingApproval,
    failed,
    totalRecoveredAmount: recoveredSumResult._sum.recoveredAmount || 0,
  };
}
