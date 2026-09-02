import { db } from "@/lib/db";
import {
  ActorType,
  AuditEventType,
  FailureCategory,
  NotificationType,
  PaymentStatus,
  Prisma,
  RecoveryStatus,
  RiskLevel,
} from "@prisma/client";
import { getRecoveryProvider, RecoveryExecutionResult } from "./provider";
import { evaluateRecoveryPolicy } from "./policy";
import { createAuditLog } from "@/server/services/auditService";

export interface ExecuteRecoveryOptions {
  merchantId?: string;
  userId?: string;
  actorType?: ActorType;
  bypassApprovalCheckForAutoRecovery?: boolean;
}

export interface ExecuteRecoveryResult {
  success: boolean;
  actionId: string;
  paymentId: string;
  status: RecoveryStatus;
  paymentStatus: PaymentStatus;
  attemptNumber: number;
  recoveredAmount: number;
  providerReference: string;
  message: string;
  isSimulated: boolean;
  alreadyExecuted?: boolean;
  error?: string;
}

/**
 * Executes a bounded recovery action through the recovery provider abstraction.
 *
 * SAFETY INVARIANTS:
 * 1. Safe Mock Provider: Does NOT claim Razorpay retries payments or perform real money movement.
 * 2. Strict Approval Gating: Rejects unapproved high-risk/low-confidence actions.
 * 3. Re-validates Deterministic Policy before executing.
 * 4. Strictly enforces max retry/attempt limits.
 * 5. Idempotent: duplicate execution calls return existing result and NEVER double-count recovered revenue.
 * 6. Audit Trail: records RECOVERY_ATTEMPT_STARTED, RECOVERY_ATTEMPT_SUCCEEDED, or RECOVERY_ATTEMPT_FAILED.
 */
export async function executeRecovery(
  recoveryActionId: string,
  options?: ExecuteRecoveryOptions
): Promise<ExecuteRecoveryResult> {
  // 1. Load RecoveryAction with complete Payment, Customer, Merchant, Failures, Attempts context
  const action = await db.recoveryAction.findFirst({
    where: {
      id: recoveryActionId,
      ...(options?.merchantId ? { payment: { merchantId: options.merchantId } } : {}),
    },
    include: {
      payment: {
        include: {
          customer: true,
          merchant: true,
          failures: { orderBy: { occurredAt: "desc" } },
        },
      },
      aiAnalysis: true,
      attempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  if (!action) {
    throw new Error(`Recovery action ${recoveryActionId} not found.`);
  }

  // 2. Idempotency Guard: If action is already successfully EXECUTED, return cached outcome without re-executing
  if (action.status === RecoveryStatus.EXECUTED) {
    const successfulAttempt =
      action.attempts.find((a) => a.status === RecoveryStatus.EXECUTED) ||
      action.attempts[action.attempts.length - 1];

    const recoveredAmount = successfulAttempt?.recoveredAmount ?? action.payment.amount;

    return {
      success: true,
      actionId: action.id,
      paymentId: action.paymentId,
      status: RecoveryStatus.EXECUTED,
      paymentStatus: action.payment.status,
      attemptNumber: successfulAttempt?.attemptNumber ?? action.attempts.length,
      recoveredAmount,
      providerReference: "idempotent_cached_execution",
      message: "Recovery action has already been executed successfully.",
      isSimulated: true,
      alreadyExecuted: true,
    };
  }

  // 3. Status Safety Checks
  if (action.status === RecoveryStatus.REJECTED) {
    throw new Error(`Cannot execute rejected recovery action ${action.id}.`);
  }

  if (action.status === RecoveryStatus.ESCALATED) {
    throw new Error(`Cannot execute escalated recovery action ${action.id} without operator resolution.`);
  }

  // 4. Retry Limit Enforcement
  const maxAttempts = action.payment.merchant.maxRetryAttempts || 3;
  if (action.attempts.length >= maxAttempts) {
    await db.recoveryAction.update({
      where: { id: action.id },
      data: { status: RecoveryStatus.ESCALATED },
    });
    throw new Error(
      `Maximum retry attempts (${maxAttempts}) reached for action ${action.id}. Escalated to manual review.`
    );
  }

  // 5. Deterministic Policy Re-evaluation Gate
  const latestFailure = action.payment.failures[0];
  const failureCategory =
    latestFailure?.category || action.payment.failureCategory || FailureCategory.UNKNOWN;
  const confidence = action.aiAnalysis?.confidence ?? 0.85;
  const recoveryProbability = action.aiAnalysis?.recoveryProbability ?? 0.75;
  const riskLevel = action.aiAnalysis?.riskLevel ?? RiskLevel.LOW;

  const policyDecision = evaluateRecoveryPolicy({
    failureCategory,
    recommendedAction: action.actionType,
    confidence,
    recoveryProbability,
    riskLevel,
    attemptCount: action.attempts.length + 1,
    merchantAutoRecoveryEnabled: action.payment.merchant.autoRecoveryEnabled,
    merchantConfidenceThreshold: action.payment.merchant.confidenceThreshold,
    merchantMaxRetryAttempts: maxAttempts,
  });

  const isApproved = action.status === RecoveryStatus.APPROVED;

  // If policy forbids this action type for this failure category and human has not explicitly approved it
  if (policyDecision.permittedAction !== action.actionType && !isApproved) {
    throw new Error(
      `Policy conflict: Action ${action.actionType} is not permitted for category ${failureCategory}. Required action: ${policyDecision.permittedAction}`
    );
  }

  // If policy says action is not allowed and not approved
  if (!policyDecision.allowed && !isApproved) {
    throw new Error(`Policy violation: ${policyDecision.reason}`);
  }

  // If policy requires approval (e.g. HIGH risk, low confidence, max retry triggers) and action is not approved
  if (policyDecision.requiresApproval && !isApproved) {
    throw new Error(`Approval required: ${policyDecision.reason} Human approval must be granted before execution.`);
  }

  // If action is PENDING_APPROVAL and not yet approved
  if (action.status === RecoveryStatus.PENDING_APPROVAL && !isApproved) {
    throw new Error(`Recovery action ${action.id} requires human approval before execution.`);
  }

  // 6. Record Audit: Recovery Attempt Started
  const attemptNumber = action.attempts.length + 1;
  const now = new Date();

  await createAuditLog({
    merchantId: action.payment.merchantId,
    userId: options?.userId,
    paymentId: action.paymentId,
    recoveryActionId: action.id,
    actorType: options?.actorType || (options?.userId ? ActorType.USER : ActorType.SYSTEM),
    eventType: AuditEventType.RECOVERY_ATTEMPT_STARTED,
    description: `Dispatched recovery execution for ${action.actionType} (Attempt #${attemptNumber})`,
    metadata: {
      recoveryActionId: action.id,
      paymentId: action.paymentId,
      actionType: action.actionType,
      attemptNumber,
      initiatedBy: options?.userId || "system",
      isSimulated: true,
    } as Prisma.InputJsonValue,
  });

  // 7. Invoke Recovery Provider (Mock dev provider)
  const provider = getRecoveryProvider();
  let providerResult: RecoveryExecutionResult;
  try {
    providerResult = await provider.execute({
      recoveryActionId: action.id,
      paymentId: action.paymentId,
      providerPaymentId: action.payment.providerPaymentId,
      amount: action.payment.amount,
      actionType: action.actionType,
      recoveryProbability,
      customerName: action.payment.customer.name,
      customerEmail: action.payment.customer.email,
      customerPhone: action.payment.customer.phone,
    });
  } catch (err) {
    providerResult = {
      success: false,
      recoveredAmount: 0,
      providerReference: `err_${Date.now()}`,
      message: err instanceof Error ? err.message : "Provider execution error",
      isSimulated: true,
    };
  }

  // 8. Transactional State Persistence
  if (providerResult.success) {
    return db.$transaction(async (tx) => {
      // Update recovery action
      await tx.recoveryAction.update({
        where: { id: action.id },
        data: {
          status: RecoveryStatus.EXECUTED,
          executedAt: now,
        },
      });

      // Create recovery attempt record
      const createdAttempt = await tx.recoveryAttempt.create({
        data: {
          recoveryActionId: action.id,
          attemptNumber,
          status: RecoveryStatus.EXECUTED,
          result: providerResult.message,
          recoveredAmount: providerResult.recoveredAmount,
          attemptedAt: now,
        },
      });

      // Update payment status to RECOVERED
      await tx.payment.update({
        where: { id: action.paymentId },
        data: {
          status: PaymentStatus.RECOVERED,
          updatedAt: now,
        },
      });

      // Update customer lifetime value and payment metrics (exactly once)
      await tx.customer.update({
        where: { id: action.payment.customerId },
        data: {
          lifetimeValue: { increment: providerResult.recoveredAmount },
          successfulPaymentCount: { increment: 1 },
        },
      });

      // Record Audit Log: RECOVERY_ATTEMPT_SUCCEEDED
      await tx.auditLog.create({
        data: {
          merchantId: action.payment.merchantId,
          userId: options?.userId,
          paymentId: action.paymentId,
          recoveryActionId: action.id,
          actorType: options?.actorType || (options?.userId ? ActorType.USER : ActorType.SYSTEM),
          eventType: AuditEventType.RECOVERY_ATTEMPT_SUCCEEDED,
          description: `Successfully recovered ₹${(providerResult.recoveredAmount / 100).toLocaleString("en-IN")} via ${action.actionType}`,
          metadata: {
            recoveryActionId: action.id,
            paymentId: action.paymentId,
            recoveryAttemptId: createdAttempt.id,
            actionType: action.actionType,
            provider: provider.name,
            recoveredAmount: providerResult.recoveredAmount,
            providerReference: providerResult.providerReference,
            isSimulated: providerResult.isSimulated,
          } as Prisma.InputJsonValue,
        },
      });

      // Record Notification
      await tx.notification.create({
        data: {
          merchantId: action.payment.merchantId,
          customerId: action.payment.customerId,
          type: NotificationType.RECOVERY_SUCCESS,
          title: `Revenue Recovered: ₹${(providerResult.recoveredAmount / 100).toLocaleString("en-IN")}`,
          message: `Recovery succeeded for payment ${action.payment.providerPaymentId || action.payment.id} from ${action.payment.customer.name}`,
        },
      });

      return {
        success: true,
        actionId: action.id,
        paymentId: action.paymentId,
        status: RecoveryStatus.EXECUTED,
        paymentStatus: PaymentStatus.RECOVERED,
        attemptNumber,
        recoveredAmount: providerResult.recoveredAmount,
        providerReference: providerResult.providerReference,
        message: providerResult.message,
        isSimulated: providerResult.isSimulated,
        alreadyExecuted: false,
      };
    });
  } else {
    // Failure Outcome
    return db.$transaction(async (tx) => {
      await tx.recoveryAction.update({
        where: { id: action.id },
        data: {
          status: RecoveryStatus.FAILED,
          executedAt: now,
        },
      });

      const createdAttempt = await tx.recoveryAttempt.create({
        data: {
          recoveryActionId: action.id,
          attemptNumber,
          status: RecoveryStatus.FAILED,
          result: providerResult.message,
          recoveredAmount: 0,
          attemptedAt: now,
        },
      });

      await tx.payment.update({
        where: { id: action.paymentId },
        data: {
          status: PaymentStatus.FAILED,
          updatedAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId: action.payment.merchantId,
          userId: options?.userId,
          paymentId: action.paymentId,
          recoveryActionId: action.id,
          actorType: options?.actorType || (options?.userId ? ActorType.USER : ActorType.SYSTEM),
          eventType: AuditEventType.RECOVERY_ATTEMPT_FAILED,
          description: `Recovery attempt #${attemptNumber} failed: ${providerResult.message}`,
          metadata: {
            recoveryActionId: action.id,
            paymentId: action.paymentId,
            recoveryAttemptId: createdAttempt.id,
            actionType: action.actionType,
            provider: provider.name,
            error: providerResult.message,
            providerReference: providerResult.providerReference,
            isSimulated: providerResult.isSimulated,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        success: false,
        actionId: action.id,
        paymentId: action.paymentId,
        status: RecoveryStatus.FAILED,
        paymentStatus: PaymentStatus.FAILED,
        attemptNumber,
        recoveredAmount: 0,
        providerReference: providerResult.providerReference,
        message: providerResult.message,
        isSimulated: providerResult.isSimulated,
        alreadyExecuted: false,
      };
    });
  }
}
