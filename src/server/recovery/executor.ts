import { db } from "@/lib/db";
import {
  RecoveryStatus,
  ActorType,
  AuditEventType,
} from "@prisma/client";
import { executeRecovery, ExecuteRecoveryResult } from "./execute-recovery";

/**
 * Operator approves a pending or recommended recovery action.
 */
export async function approveRecoveryAction(
  merchantId: string,
  userId: string,
  recoveryActionId: string
) {
  const action = await db.recoveryAction.findFirst({
    where: {
      id: recoveryActionId,
      payment: { merchantId }, // strictly merchant-scoped
    },
    include: {
      payment: true,
    },
  });

  if (!action) {
    throw new Error(`Recovery action ${recoveryActionId} not found for this merchant.`);
  }

  if (action.status !== RecoveryStatus.PENDING_APPROVAL && action.status !== RecoveryStatus.RECOMMENDED) {
    throw new Error(`Action cannot be approved because current status is ${action.status}`);
  }

  const now = new Date();

  return db.$transaction(async (tx) => {
    const updated = await tx.recoveryAction.update({
      where: { id: recoveryActionId },
      data: {
        status: RecoveryStatus.APPROVED,
        approvedById: userId,
        approvedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        merchantId,
        userId,
        paymentId: action.paymentId,
        recoveryActionId: action.id,
        actorType: ActorType.USER,
        eventType: AuditEventType.RECOVERY_ACTION_APPROVED,
        description: `Operator approved recovery action: ${action.actionType}`,
        metadata: { approvedBy: userId, approvedAt: now.toISOString() },
      },
    });

    return updated;
  });
}

/**
 * Operator rejects a recovery action.
 */
export async function rejectRecoveryAction(
  merchantId: string,
  userId: string,
  recoveryActionId: string,
  reason?: string
) {
  const action = await db.recoveryAction.findFirst({
    where: {
      id: recoveryActionId,
      payment: { merchantId },
    },
    include: { payment: true },
  });

  if (!action) {
    throw new Error(`Recovery action ${recoveryActionId} not found.`);
  }

  const rejectionReason = reason || "Declined by merchant operator";

  return db.$transaction(async (tx) => {
    const updated = await tx.recoveryAction.update({
      where: { id: recoveryActionId },
      data: {
        status: RecoveryStatus.REJECTED,
      },
    });

    await tx.auditLog.create({
      data: {
        merchantId,
        userId,
        paymentId: action.paymentId,
        recoveryActionId: action.id,
        actorType: ActorType.USER,
        eventType: AuditEventType.RECOVERY_ACTION_REJECTED,
        description: `Operator rejected recovery action: ${rejectionReason}`,
        metadata: { rejectedBy: userId, reason: rejectionReason },
      },
    });

    return updated;
  });
}

/**
 * Executes a recovery action through the bounded execution engine.
 */
export async function executeRecoveryAction(
  merchantId: string,
  userId: string,
  recoveryActionId: string
): Promise<ExecuteRecoveryResult> {
  return executeRecovery(recoveryActionId, {
    merchantId,
    userId,
    actorType: ActorType.USER,
  });
}

export { executeRecovery };
