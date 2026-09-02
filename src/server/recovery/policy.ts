import { FailureCategory, RecoveryActionType, RiskLevel } from "@prisma/client";

export interface PolicyEvaluationContext {
  failureCategory: FailureCategory;
  recommendedAction: RecoveryActionType;
  confidence: number;
  recoveryProbability: number;
  riskLevel: RiskLevel;
  attemptCount: number;
  merchantAutoRecoveryEnabled: boolean;
  merchantConfidenceThreshold: number;
  merchantMaxRetryAttempts?: number;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  permittedAction: RecoveryActionType;
  reason: string;
  policyFlags: string[];
}

/**
 * Standard mapping of failure categories to permitted recovery interventions.
 */
export const CATEGORY_ACTION_POLICY: Record<FailureCategory, RecoveryActionType[]> = {
  [FailureCategory.TEMPORARY_ISSUER_FAILURE]: [RecoveryActionType.RETRY_PAYMENT, RecoveryActionType.SEND_REMINDER],
  [FailureCategory.NETWORK_TIMEOUT]: [RecoveryActionType.RETRY_PAYMENT, RecoveryActionType.SEND_REMINDER],
  [FailureCategory.INSUFFICIENT_FUNDS]: [RecoveryActionType.SEND_REMINDER, RecoveryActionType.WAIT],
  [FailureCategory.AUTHENTICATION_FAILURE]: [RecoveryActionType.SEND_REMINDER, RecoveryActionType.RETRY_PAYMENT],
  [FailureCategory.EXPIRED_CARD]: [RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE, RecoveryActionType.SEND_REMINDER],
  [FailureCategory.INVALID_PAYMENT_METHOD]: [RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE, RecoveryActionType.SEND_REMINDER],
  [FailureCategory.CUSTOMER_CANCELLED]: [RecoveryActionType.ESCALATE, RecoveryActionType.WAIT],
  [FailureCategory.MANDATE_FAILURE]: [RecoveryActionType.ESCALATE, RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE],
  [FailureCategory.UNKNOWN]: [RecoveryActionType.ESCALATE],
};

/**
 * Evaluates deterministic business safety and compliance policies on an AI-recommended recovery action.
 */
export function evaluateRecoveryPolicy(context: PolicyEvaluationContext): PolicyDecision {
  const flags: string[] = [];
  const maxAttempts = context.merchantMaxRetryAttempts || 3;
  const threshold = context.merchantConfidenceThreshold || 0.80;

  // 1. Check permitted actions for this failure category
  const allowedActions = CATEGORY_ACTION_POLICY[context.failureCategory] || [RecoveryActionType.ESCALATE];
  let permittedAction = context.recommendedAction;

  if (!allowedActions.includes(context.recommendedAction)) {
    flags.push(`ACTION_MISMATCH_FOR_CATEGORY_${context.failureCategory}`);
    permittedAction = allowedActions[0]; // Fall back to safe policy default
  }

  // 2. Check safety stopping rule: Max retry attempts
  if (context.attemptCount >= maxAttempts) {
    flags.push("MAX_ATTEMPTS_EXCEEDED");
    return {
      allowed: false,
      requiresApproval: true,
      permittedAction: RecoveryActionType.ESCALATE,
      reason: `Maximum automated retry limit (${maxAttempts}) reached. Action escalated to manual review.`,
      policyFlags: flags,
    };
  }

  // 3. Evaluate human-in-the-loop approval triggers
  let requiresApproval = false;
  const reasons: string[] = [];

  // Flag: Merchant disabled automated execution
  if (!context.merchantAutoRecoveryEnabled) {
    requiresApproval = true;
    flags.push("MERCHANT_AUTO_RECOVERY_DISABLED");
    reasons.push("Merchant configuration requires manual approval for all recovery actions.");
  }

  // Flag: High risk action
  if (context.riskLevel === RiskLevel.HIGH) {
    requiresApproval = true;
    flags.push("HIGH_RISK_ACTION");
    reasons.push("High risk intervention requires operator review.");
  }

  // Flag: Below merchant confidence / recovery threshold
  if (context.recoveryProbability < threshold) {
    requiresApproval = true;
    flags.push("BELOW_CONFIDENCE_THRESHOLD");
    reasons.push(
      `Recovery probability (${(context.recoveryProbability * 100).toFixed(0)}%) is below merchant threshold (${(threshold * 100).toFixed(0)}%).`
    );
  }

  // Flag: Non-transient manual update request or escalation
  if (
    permittedAction === RecoveryActionType.ESCALATE ||
    permittedAction === RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE
  ) {
    requiresApproval = true;
    flags.push("MANUAL_INTERVENTION_TYPE");
    reasons.push("This action type requires customer or operator coordination.");
  }

  const allowed = true;
  const finalReason = reasons.length > 0 ? reasons.join(" ") : "Automated recovery permitted under policy guidelines.";

  return {
    allowed,
    requiresApproval,
    permittedAction,
    reason: finalReason,
    policyFlags: flags,
  };
}
