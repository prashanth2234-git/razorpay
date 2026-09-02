import { db } from "@/lib/db";
import {
  RecoveryStatus,
  PaymentStatus,
  ActorType,
  AuditEventType,
  NotificationType,
} from "@prisma/client";
import { getRecoveryProvider } from "./provider";

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

export async function executeRecoveryAction(
  merchantId: string,
  userId: string,
  recoveryActionId: string
) {
  const action = await db.recoveryAction.findFirst({
    where: {
      id: recoveryActionId,
      payment: { merchantId },
    },
    include: {
      payment: {
        include: { customer: true },
      },
      aiAnalysis: true,
      attempts: true,
    },
  });

  if (!action) {
    throw new Error(`Recovery action ${recoveryActionId} not found.`);
  }

  // Audit: Recovery attempt started
  await db.auditLog.create({
    data: {
      merchantId,
      userId,
      paymentId: action.paymentId,
      recoveryActionId: action.id,
      actorType: ActorType.USER,
      eventType: AuditEventType.RECOVERY_ATTEMPT_STARTED,
      description: `Dispatched recovery workflow execution: ${action.actionType}`,
      metadata: { initiatedBy: userId },
    },
  });

  const provider = getRecoveryProvider();
  const result = await provider.execute({
    recoveryActionId: action.id,
    paymentId: action.paymentId,
    providerPaymentId: action.payment.providerPaymentId,
    amount: action.payment.amount,
    actionType: action.actionType,
    recoveryProbability: action.aiAnalysis?.recoveryProbability || 0.75,
    customerName: action.payment.customer.name,
    customerEmail: action.payment.customer.email,
    customerPhone: action.payment.customer.phone,
  });

  const now = new Date();
  const attemptNumber = action.attempts.length + 1;

  if (result.success) {
    return db.$transaction(async (tx) => {
      // 1. Update recovery action
      const updatedAction = await tx.recoveryAction.update({
        where: { id: action.id },
        data: {
          status: RecoveryStatus.EXECUTED,
          executedAt: now,
        },
      });

      // 2. Create recovery attempt record
      await tx.recoveryAttempt.create({
        data: {
          recoveryActionId: action.id,
          attemptNumber,
          status: RecoveryStatus.EXECUTED,
          result: result.message,
          recoveredAmount: result.recoveredAmount,
          attemptedAt: now,
        },
      });

      // 3. Update payment status to RECOVERED
      await tx.payment.update({
        where: { id: action.paymentId },
        data: {
          status: PaymentStatus.RECOVERED,
          updatedAt: now,
        },
      });

      // 4. Update customer aggregate lifetime value
      await tx.customer.update({
        where: { id: action.payment.customerId },
        data: {
          lifetimeValue: { increment: result.recoveredAmount },
          successfulPaymentCount: { increment: 1 },
        },
      });

      // 5. Create audit log
      await tx.auditLog.create({
        data: {
          merchantId,
          userId,
          paymentId: action.paymentId,
          recoveryActionId: action.id,
          actorType: ActorType.SYSTEM,
          eventType: AuditEventType.RECOVERY_ATTEMPT_SUCCEEDED,
          description: `Successfully recovered ₹${(result.recoveredAmount / 100).toLocaleString("en-IN")} via ${action.actionType}`,
          metadata: {
            recoveredAmount: result.recoveredAmount,
            providerReference: result.providerReference,
          },
        },
      });

      // 6. Create notification
      await tx.notification.create({
        data: {
          merchantId,
          customerId: action.payment.customerId,
          type: NotificationType.RECOVERY_SUCCESS,
          title: `Revenue Recovered: ₹${(result.recoveredAmount / 100).toLocaleString("en-IN")}`,
          message: `Recovery succeeded for payment ${action.payment.providerPaymentId || action.payment.id} from ${action.payment.customer.name}`,
        },
      });

      return {
        success: true,
        action: updatedAction,
        result,
      };
    });
  } else {
    // Failure flow
    return db.$transaction(async (tx) => {
      const updatedAction = await tx.recoveryAction.update({
        where: { id: action.id },
        data: {
          status: RecoveryStatus.FAILED,
          executedAt: now,
        },
      });

      await tx.recoveryAttempt.create({
        data: {
          recoveryActionId: action.id,
          attemptNumber,
          status: RecoveryStatus.FAILED,
          result: result.message,
          recoveredAmount: 0,
          attemptedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId,
          userId,
          paymentId: action.paymentId,
          recoveryActionId: action.id,
          actorType: ActorType.SYSTEM,
          eventType: AuditEventType.RECOVERY_ATTEMPT_FAILED,
          description: `Recovery attempt failed: ${result.message}`,
          metadata: {
            error: result.message,
            providerReference: result.providerReference,
          },
        },
      });

      return {
        success: false,
        action: updatedAction,
        result,
      };
    });
  }
}
