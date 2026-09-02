import { describe, it, expect } from "vitest";
import { FailureCategory, RecoveryActionType, RiskLevel } from "@prisma/client";
import { calculateRecoveryOpportunity } from "./scoring";
import { evaluateRecoveryPolicy } from "./policy";
import { MockRecoveryProvider } from "./provider";

describe("Recovery Opportunity Scoring (PART 6 & 18)", () => {
  it("ranks high-value and high-probability opportunities as HIGH priority", () => {
    const result = calculateRecoveryOpportunity({
      amount: 1250000, // ₹12,500
      recoveryProbability: 0.92,
      riskLevel: RiskLevel.LOW,
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      customerSuccessfulPayments: 6,
      attemptCount: 0,
    });

    expect(result.priority).toBe("HIGH");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.expectedRecoveryAmount).toBe(1150000); // 1250000 * 0.92
  });

  it("ranks low-value and low-probability opportunities as LOW priority", () => {
    const result = calculateRecoveryOpportunity({
      amount: 90000, // ₹900
      recoveryProbability: 0.31,
      riskLevel: RiskLevel.HIGH,
      failureCategory: FailureCategory.MANDATE_FAILURE,
      attemptCount: 2,
    });

    expect(result.priority).toBe("LOW");
    expect(result.score).toBeLessThan(40);
  });

  it("applies penalty deductions for repeated failed attempts", () => {
    const freshOpportunity = calculateRecoveryOpportunity({
      amount: 500000,
      recoveryProbability: 0.85,
      riskLevel: RiskLevel.LOW,
      attemptCount: 0,
    });

    const retriedOpportunity = calculateRecoveryOpportunity({
      amount: 500000,
      recoveryProbability: 0.85,
      riskLevel: RiskLevel.LOW,
      attemptCount: 3,
    });

    expect(retriedOpportunity.score).toBeLessThan(freshOpportunity.score);
    expect(retriedOpportunity.scoreBreakdown.attemptPenalty).toBe(30);
  });
});

describe("Bounded Recovery Policy Engine (PART 7, 17 & 18)", () => {
  it("Scenario A: Temporary issuer failure + high confidence -> retry permitted automatically", () => {
    const decision = evaluateRecoveryPolicy({
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      confidence: 0.95,
      recoveryProbability: 0.88,
      riskLevel: RiskLevel.LOW,
      attemptCount: 0,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
    expect(decision.permittedAction).toBe(RecoveryActionType.RETRY_PAYMENT);
  });

  it("Scenario B: Expired card -> payment method update permitted (requires user intervention)", () => {
    const decision = evaluateRecoveryPolicy({
      failureCategory: FailureCategory.EXPIRED_CARD,
      recommendedAction: RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE,
      confidence: 0.96,
      recoveryProbability: 0.75,
      riskLevel: RiskLevel.LOW,
      attemptCount: 0,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.permittedAction).toBe(RecoveryActionType.REQUEST_PAYMENT_METHOD_UPDATE);
    expect(decision.requiresApproval).toBe(true);
  });

  it("Scenario C: High risk -> human approval strictly required", () => {
    const decision = evaluateRecoveryPolicy({
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      confidence: 0.90,
      recoveryProbability: 0.85,
      riskLevel: RiskLevel.HIGH,
      attemptCount: 0,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.requiresApproval).toBe(true);
    expect(decision.policyFlags).toContain("HIGH_RISK_ACTION");
  });

  it("Scenario D: Repeated failed attempts -> automated retry blocked and escalated", () => {
    const decision = evaluateRecoveryPolicy({
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      confidence: 0.90,
      recoveryProbability: 0.85,
      riskLevel: RiskLevel.LOW,
      attemptCount: 3, // max retry reached
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
      merchantMaxRetryAttempts: 3,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.permittedAction).toBe(RecoveryActionType.ESCALATE);
    expect(decision.policyFlags).toContain("MAX_ATTEMPTS_EXCEEDED");
  });

  it("Scenario E: Low recovery probability -> automated execution blocked", () => {
    const decision = evaluateRecoveryPolicy({
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      confidence: 0.90,
      recoveryProbability: 0.52, // below threshold 0.80
      riskLevel: RiskLevel.LOW,
      attemptCount: 0,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.requiresApproval).toBe(true);
    expect(decision.policyFlags).toContain("BELOW_CONFIDENCE_THRESHOLD");
  });

  it("Scenario F: Merchant auto-recovery disabled -> all actions require human approval", () => {
    const decision = evaluateRecoveryPolicy({
      failureCategory: FailureCategory.NETWORK_TIMEOUT,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      confidence: 0.99,
      recoveryProbability: 0.95,
      riskLevel: RiskLevel.LOW,
      attemptCount: 0,
      merchantAutoRecoveryEnabled: false, // merchant opted out of auto
      merchantConfidenceThreshold: 0.80,
    });

    expect(decision.requiresApproval).toBe(true);
    expect(decision.policyFlags).toContain("MERCHANT_AUTO_RECOVERY_DISABLED");
  });
});

describe("Mock Recovery Provider Execution (PART 10)", () => {
  const provider = new MockRecoveryProvider();

  it("captures recovered amount successfully on high probability retry", async () => {
    const result = await provider.execute({
      recoveryActionId: "act_test_01",
      paymentId: "pay_test_01",
      amount: 499900,
      actionType: RecoveryActionType.RETRY_PAYMENT,
      recoveryProbability: 0.90,
      customerName: "Aarav Gupta",
    });

    expect(result.success).toBe(true);
    expect(result.recoveredAmount).toBe(499900);
    expect(result.providerReference).toBeDefined();
    expect(result.isSimulated).toBe(true);
  });
});
