import { db } from "@/lib/db";
import {
  ActorType,
  AuditEventType,
  FailureCategory,
  NotificationType,
  Prisma,
  RecoveryActionType,
  RecoveryStatus,
  RiskLevel,
} from "@prisma/client";
import {
  analyzePaymentWithClaude,
  createDeterministicDiagnosis,
  isClaudeConfigured,
  PaymentAnalysisInput,
  AiDiagnosisResponse,
  AiDiagnosisResponseSchema,
} from "@/server/ai/claude";
import {
  analyzePaymentWithGemini,
  isGeminiConfigured,
} from "@/server/ai/gemini";
import { evaluateAiRecoveryRecommendation } from "@/server/recovery/ai-policy";
import { createAuditLog } from "@/server/audit/audit-service";
import { createNotification } from "@/server/notifications/notification-service";

export interface ProcessFailedPaymentOptions {
  preferredProvider?: "claude" | "gemini" | "auto";
  source?: "webhook" | "manual" | "scheduled";
}

export interface ProcessFailedPaymentResult {
  success: boolean;
  paymentId: string;
  aiAnalysisId?: string;
  recoveryActionId?: string;
  aiProvider: string;
  isFallback: boolean;
  recommendedAction: RecoveryActionType;
  policyPermittedAction: RecoveryActionType;
  policyStatus: string;
  requiresHumanApproval: boolean;
  recoveryStatus: RecoveryStatus;
  expectedRecoveryAmount: number;
  error?: string;
}

/**
 * Orchestrates automated AI diagnosis and deterministic policy gating for a failed payment.
 *
 * SAFETY INVARIANTS:
 * 1. AI is advisory only — never executes payment recovery directly.
 * 2. Deterministic recovery policy remains authoritative over AI recommendations.
 * 3. Human approval requirements are strictly enforced for high-risk / low-confidence cases.
 * 4. Idempotent: safe against duplicate invocations for the same payment.
 * 5. Robust fallback: uses deterministic diagnosis if external AI provider is unavailable.
 */
export async function processFailedPayment(
  paymentId: string,
  options?: ProcessFailedPaymentOptions
): Promise<ProcessFailedPaymentResult> {
  // 1. Fetch Payment with complete customer, merchant, and attempt history
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      customer: true,
      merchant: true,
      attempts: { orderBy: { attemptNumber: "desc" } },
      failures: { orderBy: { occurredAt: "desc" } },
      aiAnalyses: { orderBy: { createdAt: "desc" } },
      recoveryActions: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!payment) {
    return {
      success: false,
      paymentId,
      aiProvider: "unknown",
      isFallback: true,
      recommendedAction: RecoveryActionType.ESCALATE,
      policyPermittedAction: RecoveryActionType.ESCALATE,
      policyStatus: "PAYMENT_NOT_FOUND",
      requiresHumanApproval: true,
      recoveryStatus: RecoveryStatus.ESCALATED,
      expectedRecoveryAmount: 0,
      error: `Payment record ${paymentId} not found in database.`,
    };
  }

  // 2. Idempotency Guard: Prevent duplicate analyses or recovery actions on the same payment
  if (payment.aiAnalyses.length > 0 && payment.recoveryActions.length > 0) {
    const existingAnalysis = payment.aiAnalyses[0];
    const existingAction = payment.recoveryActions[0];

    return {
      success: true,
      paymentId: payment.id,
      aiAnalysisId: existingAnalysis.id,
      recoveryActionId: existingAction.id,
      aiProvider: existingAnalysis.modelProvider,
      isFallback: false,
      recommendedAction: existingAnalysis.recommendedAction,
      policyPermittedAction: existingAction.actionType,
      policyStatus: "ALREADY_PROCESSED",
      requiresHumanApproval: existingAction.status === RecoveryStatus.PENDING_APPROVAL,
      recoveryStatus: existingAction.status,
      expectedRecoveryAmount: existingAction.expectedRecoveryAmount || 0,
    };
  }

  // 3. Assemble normalized input for diagnostic AI providers
  const latestFailure = payment.failures[0];
  const input: PaymentAnalysisInput = {
    paymentId: payment.id,
    providerPaymentId: payment.providerPaymentId,
    amount: payment.amount,
    currency: payment.currency,
    paymentMethod: payment.method,
    paymentStatus: payment.status,
    failureCategory: latestFailure?.category || payment.failureCategory || FailureCategory.UNKNOWN,
    failureMessage: latestFailure?.providerDescription || payment.description,
    failureCode: latestFailure?.providerCode,
    attemptCount: payment.attempts.length > 0 ? payment.attempts.length : 1,
    customerName: payment.customer.name,
    customerLifetimeValue: payment.customer.lifetimeValue,
    customerSuccessfulPaymentCount: payment.customer.successfulPaymentCount,
    customerFailedPaymentCount: payment.customer.failedPaymentCount,
    merchantAutoRecoveryEnabled: payment.merchant.autoRecoveryEnabled,
    merchantConfidenceThreshold: payment.merchant.confidenceThreshold,
  };

  // 4. Run AI Provider with Fallback Strategy
  let diagnosisData: AiDiagnosisResponse;
  let providerName = "deterministic_fallback";
  let modelName = "deterministic-rule-engine-v1";
  let isFallback = true;

  const preferred = options?.preferredProvider || "auto";

  try {
    if (preferred === "claude" && isClaudeConfigured()) {
      const claudeRes = await analyzePaymentWithClaude(input);
      if (claudeRes.success) {
        diagnosisData = claudeRes.data;
        providerName = "anthropic";
        modelName = claudeRes.model;
        isFallback = false;
      } else {
        diagnosisData = createDeterministicDiagnosis(input);
      }
    } else if (preferred === "gemini" && isGeminiConfigured()) {
      const geminiRes = await analyzePaymentWithGemini(input);
      if (geminiRes.success) {
        diagnosisData = geminiRes.data;
        providerName = "gemini";
        modelName = geminiRes.model;
        isFallback = false;
      } else {
        diagnosisData = createDeterministicDiagnosis(input);
      }
    } else if (isClaudeConfigured()) {
      const claudeRes = await analyzePaymentWithClaude(input);
      if (claudeRes.success) {
        diagnosisData = claudeRes.data;
        providerName = "anthropic";
        modelName = claudeRes.model;
        isFallback = false;
      } else {
        diagnosisData = createDeterministicDiagnosis(input);
      }
    } else if (isGeminiConfigured()) {
      const geminiRes = await analyzePaymentWithGemini(input);
      if (geminiRes.success) {
        diagnosisData = geminiRes.data;
        providerName = "gemini";
        modelName = geminiRes.model;
        isFallback = false;
      } else {
        diagnosisData = createDeterministicDiagnosis(input);
      }
    } else {
      // Deterministic fallback when no API credentials configured
      diagnosisData = createDeterministicDiagnosis(input);
    }
  } catch (err) {
    console.error("AI diagnosis error during failed payment processing:", err);
    diagnosisData = createDeterministicDiagnosis(input);
    isFallback = true;
  }

  // Schema validation safety check
  const validated = AiDiagnosisResponseSchema.safeParse(diagnosisData);
  if (!validated.success) {
    diagnosisData = createDeterministicDiagnosis(input);
    isFallback = true;
    providerName = "deterministic_fallback";
    modelName = "deterministic-rule-engine-v1";
  }

  // 5. Persist AiAnalysis Record
  const aiAnalysis = await db.aiAnalysis.create({
    data: {
      paymentId: payment.id,
      diagnosis: diagnosisData.diagnosis,
      confidence: diagnosisData.confidence,
      recoveryProbability: diagnosisData.recoveryProbability,
      recommendedAction: diagnosisData.recommendedAction as RecoveryActionType,
      riskLevel: diagnosisData.riskLevel as RiskLevel,
      reasoning: diagnosisData.reasoning,
      modelProvider: providerName,
      modelName: modelName,
      rawMetadata: {
        isFallback,
        source: options?.source || "webhook",
        evaluatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  // 6. Pass Recommendation through Deterministic AI Policy Gate
  const policyDecision = evaluateAiRecoveryRecommendation({
    aiRecommendation: diagnosisData,
    failureCategory: (input.failureCategory as FailureCategory) || FailureCategory.UNKNOWN,
    attemptCount: input.attemptCount || 1,
    merchantAutoRecoveryEnabled: payment.merchant.autoRecoveryEnabled,
    merchantConfidenceThreshold: payment.merchant.confidenceThreshold,
    merchantMaxRetryAttempts: payment.merchant.maxRetryAttempts,
  });

  // 7. Determine Recovery Status
  let recoveryStatus: RecoveryStatus = RecoveryStatus.PENDING_APPROVAL;
  if (policyDecision.status === "AI_RECOMMENDATION_ESCALATED") {
    recoveryStatus = RecoveryStatus.ESCALATED;
  } else if (policyDecision.status === "AI_RECOMMENDATION_REJECTED") {
    recoveryStatus = RecoveryStatus.REJECTED;
  } else if (policyDecision.requiresHumanApproval) {
    recoveryStatus = RecoveryStatus.PENDING_APPROVAL;
  } else {
    recoveryStatus = RecoveryStatus.RECOMMENDED;
  }

  const expectedRecoveryAmount = Math.round(
    payment.amount * diagnosisData.recoveryProbability
  );

  // 8. Create RecoveryAction Record (Advisory recommendation only)
  const recoveryAction = await db.recoveryAction.create({
    data: {
      paymentId: payment.id,
      aiAnalysisId: aiAnalysis.id,
      actionType: policyDecision.policyPermittedAction,
      status: recoveryStatus,
      expectedRecoveryAmount,
      config: {
        aiRecommendedAction: diagnosisData.recommendedAction,
        policyPermittedAction: policyDecision.policyPermittedAction,
        policyReason: policyDecision.policyReason,
        policyStatus: policyDecision.status,
        requiresHumanApproval: policyDecision.requiresHumanApproval,
        isPolicyOverridden: policyDecision.isPolicyOverridden,
        policyFlags: policyDecision.policyFlags,
        isFallback,
      } as Prisma.InputJsonValue,
    },
  });

  // 9. Record Immutable Audit Logs
  // Log 1: AI Diagnosis Generated
  await createAuditLog({
    merchantId: payment.merchantId,
    paymentId: payment.id,
    actorType: isFallback ? ActorType.SYSTEM : ActorType.AI_AGENT,
    eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
    description: `${isFallback ? "Deterministic engine" : "AI Agent (" + providerName + ")"} generated diagnosis: ${diagnosisData.recommendedAction} (${(diagnosisData.confidence * 100).toFixed(0)}% confidence, ${(diagnosisData.recoveryProbability * 100).toFixed(0)}% recovery probability)`,
    metadata: {
      provider: providerName,
      model: modelName,
      isFallback,
      confidence: diagnosisData.confidence,
      recoveryProbability: diagnosisData.recoveryProbability,
      recommendedAction: diagnosisData.recommendedAction,
      riskLevel: diagnosisData.riskLevel,
      aiAnalysisId: aiAnalysis.id,
    } as Prisma.InputJsonValue,
  });

  // Log 2: Recovery Action Created
  await createAuditLog({
    merchantId: payment.merchantId,
    paymentId: payment.id,
    recoveryActionId: recoveryAction.id,
    actorType: ActorType.SYSTEM,
    eventType: AuditEventType.RECOVERY_ACTION_CREATED,
    description: `Created recovery recommendation ${recoveryAction.actionType} (Status: ${recoveryAction.status}) via policy gate: ${policyDecision.policyReason}`,
    metadata: {
      actionType: recoveryAction.actionType,
      status: recoveryAction.status,
      expectedRecoveryAmount,
      policyStatus: policyDecision.status,
      requiresHumanApproval: policyDecision.requiresHumanApproval,
      isPolicyOverridden: policyDecision.isPolicyOverridden,
      policyFlags: policyDecision.policyFlags,
    } as Prisma.InputJsonValue,
  });

  // 10. Record Notifications
  await createNotification({
    merchantId: payment.merchantId,
    customerId: payment.customerId,
    type: NotificationType.PAYMENT_FAILURE,
    title: `Payment Failed: ₹${(payment.amount / 100).toLocaleString("en-IN")}`,
    message: `Payment ${payment.providerPaymentId || payment.id} failed (${payment.failureCategory || "Gateway Error"})`,
    metadata: {
      paymentId: payment.id,
      amount: payment.amount,
      failureCategory: payment.failureCategory,
    },
  });

  if (recoveryStatus === RecoveryStatus.PENDING_APPROVAL) {
    await createNotification({
      merchantId: payment.merchantId,
      customerId: payment.customerId,
      type: NotificationType.APPROVAL_REQUIRED,
      title: `Approval Required: ₹${(expectedRecoveryAmount / 100).toLocaleString("en-IN")}`,
      message: `Operator sign-off required for ${recoveryAction.actionType.replace(/_/g, " ")} on payment ${payment.providerPaymentId || payment.id}`,
      metadata: {
        recoveryActionId: recoveryAction.id,
        paymentId: payment.id,
        amount: expectedRecoveryAmount,
      },
    });
  }

  if (diagnosisData.riskLevel === RiskLevel.HIGH) {
    await createNotification({
      merchantId: payment.merchantId,
      customerId: payment.customerId,
      type: NotificationType.RISK_ALERT,
      title: "High Risk Detected on Failed Payment",
      message: `AI diagnostic flagged high risk on payment ${payment.providerPaymentId || payment.id}: ${diagnosisData.reasoning}`,
      metadata: {
        paymentId: payment.id,
        riskLevel: diagnosisData.riskLevel,
      },
    });
  }

  return {
    success: true,
    paymentId: payment.id,
    aiAnalysisId: aiAnalysis.id,
    recoveryActionId: recoveryAction.id,
    aiProvider: providerName,
    isFallback,
    recommendedAction: diagnosisData.recommendedAction as RecoveryActionType,
    policyPermittedAction: policyDecision.policyPermittedAction,
    policyStatus: policyDecision.status,
    requiresHumanApproval: policyDecision.requiresHumanApproval,
    recoveryStatus,
    expectedRecoveryAmount,
  };
}
