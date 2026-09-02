import { FailureCategory, RecoveryActionType, RiskLevel } from "@prisma/client";
import { evaluateRecoveryPolicy, PolicyDecision } from "./policy";

export interface AiRecommendationInput {
  recommendedAction: RecoveryActionType | string;
  confidence: number;
  recoveryProbability: number;
  riskLevel: RiskLevel | string;
  diagnosis?: string;
  reasoning?: string;
}

export interface AiPolicyEvaluationContext {
  aiRecommendation: AiRecommendationInput;
  failureCategory: FailureCategory;
  attemptCount: number;
  merchantAutoRecoveryEnabled: boolean;
  merchantConfidenceThreshold: number;
  merchantMaxRetryAttempts?: number;
}

export type AiPolicyStatus =
  | "AI_RECOMMENDATION_ACCEPTED"
  | "AI_RECOMMENDATION_REQUIRES_APPROVAL"
  | "AI_RECOMMENDATION_REJECTED"
  | "AI_RECOMMENDATION_ESCALATED";

export interface AiPolicyDecision {
  status: AiPolicyStatus;
  aiRecommendedAction: RecoveryActionType;
  policyPermittedAction: RecoveryActionType;
  aiConfidence: number;
  aiRecoveryProbability: number;
  aiRiskLevel: RiskLevel;
  requiresHumanApproval: boolean;
  isPolicyOverridden: boolean;
  policyReason: string;
  policyFlags: string[];
  rawPolicyDecision: PolicyDecision;
}

/**
 * Passes an AI-recommended recovery action through the authoritative deterministic recovery policy engine.
 * The policy engine strictly governs whether the recommendation is accepted, requires approval, is rejected, or is escalated.
 */
export function evaluateAiRecoveryRecommendation(
  context: AiPolicyEvaluationContext
): AiPolicyDecision {
  const aiAction = context.aiRecommendation.recommendedAction as RecoveryActionType;
  const aiRisk = (context.aiRecommendation.riskLevel as RiskLevel) || RiskLevel.LOW;
  const aiConfidence = context.aiRecommendation.confidence;
  const aiProbability = context.aiRecommendation.recoveryProbability;

  // 1. Evaluate using authoritative policy engine
  const policyDecision = evaluateRecoveryPolicy({
    failureCategory: context.failureCategory,
    recommendedAction: aiAction,
    confidence: aiConfidence,
    recoveryProbability: aiProbability,
    riskLevel: aiRisk,
    attemptCount: context.attemptCount,
    merchantAutoRecoveryEnabled: context.merchantAutoRecoveryEnabled,
    merchantConfidenceThreshold: context.merchantConfidenceThreshold,
    merchantMaxRetryAttempts: context.merchantMaxRetryAttempts,
  });

  const isActionMismatch = policyDecision.permittedAction !== aiAction;
  const isPolicyOverridden = isActionMismatch || !policyDecision.allowed;

  // 2. Classify status into clear AI-Policy outcome
  let status: AiPolicyStatus = "AI_RECOMMENDATION_ACCEPTED";

  if (policyDecision.permittedAction === RecoveryActionType.ESCALATE) {
    status = "AI_RECOMMENDATION_ESCALATED";
  } else if (!policyDecision.allowed) {
    status = "AI_RECOMMENDATION_REJECTED";
  } else if (isActionMismatch) {
    status = "AI_RECOMMENDATION_REJECTED";
  } else if (policyDecision.requiresApproval) {
    status = "AI_RECOMMENDATION_REQUIRES_APPROVAL";
  } else {
    status = "AI_RECOMMENDATION_ACCEPTED";
  }

  return {
    status,
    aiRecommendedAction: aiAction,
    policyPermittedAction: policyDecision.permittedAction,
    aiConfidence,
    aiRecoveryProbability: aiProbability,
    aiRiskLevel: aiRisk,
    requiresHumanApproval: policyDecision.requiresApproval,
    isPolicyOverridden,
    policyReason: policyDecision.reason,
    policyFlags: policyDecision.policyFlags,
    rawPolicyDecision: policyDecision,
  };
}
