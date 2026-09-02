import { describe, it, expect } from "vitest";
import { FailureCategory, RecoveryActionType, RiskLevel } from "@prisma/client";
import { evaluateAiRecoveryRecommendation } from "./ai-policy";

describe("AI Recommendation to Bounded Policy Bridge (Milestone 5 Step 8)", () => {
  it("Scenario 1: Claude recommends permitted action with high confidence and low risk -> policy accepts automatically", () => {
    const decision = evaluateAiRecoveryRecommendation({
      aiRecommendation: {
        recommendedAction: RecoveryActionType.RETRY_PAYMENT,
        confidence: 0.95,
        recoveryProbability: 0.90,
        riskLevel: RiskLevel.LOW,
      },
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      attemptCount: 1,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.status).toBe("AI_RECOMMENDATION_ACCEPTED");
    expect(decision.requiresHumanApproval).toBe(false);
    expect(decision.policyPermittedAction).toBe(RecoveryActionType.RETRY_PAYMENT);
    expect(decision.isPolicyOverridden).toBe(false);
  });

  it("Scenario 2: Claude recommends incompatible action for category -> deterministic policy overrides and rejects action", () => {
    // Claude erroneously recommends RETRY_PAYMENT for EXPIRED_CARD
    const decision = evaluateAiRecoveryRecommendation({
      aiRecommendation: {
        recommendedAction: RecoveryActionType.RETRY_PAYMENT, // incompatible with EXPIRED_CARD
        confidence: 0.90,
        recoveryProbability: 0.85,
        riskLevel: RiskLevel.LOW,
      },
      failureCategory: FailureCategory.EXPIRED_CARD,
      attemptCount: 1,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.status).toBe("AI_RECOMMENDATION_REJECTED");
    expect(decision.isPolicyOverridden).toBe(true);
    // Policy enforces REQUEST_PAYMENT_METHOD_UPDATE
    expect(decision.policyPermittedAction).toBe(RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE);
    expect(decision.policyFlags).toContain("ACTION_MISMATCH_FOR_CATEGORY_EXPIRED_CARD");
  });

  it("Scenario 3: High-risk Claude recommendation -> human approval strictly required", () => {
    const decision = evaluateAiRecoveryRecommendation({
      aiRecommendation: {
        recommendedAction: RecoveryActionType.RETRY_PAYMENT,
        confidence: 0.92,
        recoveryProbability: 0.88,
        riskLevel: RiskLevel.HIGH, // High risk
      },
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      attemptCount: 1,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.status).toBe("AI_RECOMMENDATION_REQUIRES_APPROVAL");
    expect(decision.requiresHumanApproval).toBe(true);
    expect(decision.policyFlags).toContain("HIGH_RISK_ACTION");
  });

  it("Scenario 4: Low recovery probability below merchant threshold -> approval required", () => {
    const decision = evaluateAiRecoveryRecommendation({
      aiRecommendation: {
        recommendedAction: RecoveryActionType.RETRY_PAYMENT,
        confidence: 0.90,
        recoveryProbability: 0.65, // below 0.80 threshold
        riskLevel: RiskLevel.LOW,
      },
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      attemptCount: 1,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.status).toBe("AI_RECOMMENDATION_REQUIRES_APPROVAL");
    expect(decision.requiresHumanApproval).toBe(true);
    expect(decision.policyFlags).toContain("BELOW_CONFIDENCE_THRESHOLD");
  });

  it("Scenario 5: Maximum attempts reached -> automated retry blocked and escalated", () => {
    const decision = evaluateAiRecoveryRecommendation({
      aiRecommendation: {
        recommendedAction: RecoveryActionType.RETRY_PAYMENT,
        confidence: 0.95,
        recoveryProbability: 0.92,
        riskLevel: RiskLevel.LOW,
      },
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      attemptCount: 3, // max retry attempts reached
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
      merchantMaxRetryAttempts: 3,
    });

    expect(decision.status).toBe("AI_RECOMMENDATION_ESCALATED");
    expect(decision.policyPermittedAction).toBe(RecoveryActionType.ESCALATE);
    expect(decision.requiresHumanApproval).toBe(true);
    expect(decision.policyFlags).toContain("MAX_ATTEMPTS_EXCEEDED");
  });

  it("Scenario 6: Merchant auto-recovery disabled -> all AI actions require operator approval", () => {
    const decision = evaluateAiRecoveryRecommendation({
      aiRecommendation: {
        recommendedAction: RecoveryActionType.RETRY_PAYMENT,
        confidence: 0.99,
        recoveryProbability: 0.98,
        riskLevel: RiskLevel.LOW,
      },
      failureCategory: FailureCategory.NETWORK_TIMEOUT,
      attemptCount: 1,
      merchantAutoRecoveryEnabled: false, // merchant disabled auto recovery
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.status).toBe("AI_RECOMMENDATION_REQUIRES_APPROVAL");
    expect(decision.requiresHumanApproval).toBe(true);
    expect(decision.policyFlags).toContain("MERCHANT_AUTO_RECOVERY_DISABLED");
  });

  it("Scenario 7: AI recommendation cannot bypass policy on terminal customer cancellation", () => {
    const decision = evaluateAiRecoveryRecommendation({
      aiRecommendation: {
        recommendedAction: RecoveryActionType.RETRY_PAYMENT,
        confidence: 0.90,
        recoveryProbability: 0.70,
        riskLevel: RiskLevel.LOW,
      },
      failureCategory: FailureCategory.CUSTOMER_CANCELLED,
      attemptCount: 1,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.status).toBe("AI_RECOMMENDATION_ESCALATED");
    expect(decision.policyPermittedAction).toBe(RecoveryActionType.ESCALATE);
    expect(decision.requiresHumanApproval).toBe(true);
  });
});
