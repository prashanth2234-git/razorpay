import { describe, it, expect } from "vitest";
import {
  runEvaluation,
  DeterministicBaselinePredictor,
  EVALUATION_DATASET,
  EVALUATION_DATASET_VERSION,
  EvaluationCase,
} from "./evaluation";
import { FailureCategory, PaymentMethod, RecoveryActionType, RiskLevel } from "@prisma/client";

describe("Offline AI Evaluation Harness (Milestone 5 Step 9)", () => {
  const provider = new DeterministicBaselinePredictor();

  it("evaluates dataset completeness and structure", () => {
    expect(EVALUATION_DATASET.length).toBeGreaterThanOrEqual(10);
    expect(EVALUATION_DATASET_VERSION).toBeDefined();

    const categories = new Set(EVALUATION_DATASET.map((c) => c.failureCategory));
    expect(categories.has(FailureCategory.TEMPORARY_ISSUER_FAILURE)).toBe(true);
    expect(categories.has(FailureCategory.NETWORK_TIMEOUT)).toBe(true);
    expect(categories.has(FailureCategory.INSUFFICIENT_FUNDS)).toBe(true);
    expect(categories.has(FailureCategory.EXPIRED_CARD)).toBe(true);
    expect(categories.has(FailureCategory.AUTHENTICATION_FAILURE)).toBe(true);
    expect(categories.has(FailureCategory.CUSTOMER_CANCELLED)).toBe(true);
    expect(categories.has(FailureCategory.MANDATE_FAILURE)).toBe(true);
  });

  it("computes accurate baseline metrics on full evaluation dataset", () => {
    const report = runEvaluation(EVALUATION_DATASET, provider, EVALUATION_DATASET_VERSION);

    expect(report.providerName).toBe("deterministic-baseline");
    expect(report.datasetVersion).toBe(EVALUATION_DATASET_VERSION);
    expect(report.metrics.totalCases).toBe(EVALUATION_DATASET.length);

    // Decision quality metrics
    expect(report.metrics.actionAccuracy).toBeGreaterThanOrEqual(90.0);
    expect(report.metrics.riskAccuracy).toBeGreaterThanOrEqual(90.0);

    // Policy safety metrics
    expect(report.metrics.policyCompatibilityRate).toBeGreaterThanOrEqual(90.0);
    expect(report.metrics.highRiskEscalationRate).toBeGreaterThan(0.0);

    // Financial calculations
    expect(report.metrics.totalRevenueAtRisk).toBeGreaterThan(0);
    expect(report.metrics.totalExpectedRecoverable).toBeGreaterThan(0);
    expect(report.metrics.totalExpectedRecoverable).toBeLessThanOrEqual(
      report.metrics.totalRevenueAtRisk
    );
  });

  it("handles empty dataset edge case without NaN or division by zero", () => {
    const report = runEvaluation([], provider, "vEmpty");

    expect(report.metrics.totalCases).toBe(0);
    expect(report.metrics.actionAccuracy).toBe(0);
    expect(report.metrics.riskAccuracy).toBe(0);
    expect(report.metrics.policyCompatibilityRate).toBe(0);
    expect(report.metrics.totalRevenueAtRisk).toBe(0);
    expect(report.metrics.totalExpectedRecoverable).toBe(0);
    expect(Number.isNaN(report.metrics.actionAccuracy)).toBe(false);
  });

  it("calculates accuracy on synthetic subset with known ground truth mismatch", () => {
    const syntheticCases: EvaluationCase[] = [
      {
        id: "c1",
        name: "Case 1",
        amount: 100000,
        currency: "INR",
        paymentMethod: PaymentMethod.UPI,
        failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
        attemptCount: 1,
        customerLifetimeValue: 500000,
        customerSuccessfulPayments: 3,
        customerFailedPayments: 0,
        merchantAutoRecoveryEnabled: true,
        merchantConfidenceThreshold: 0.8,
        merchantMaxRetryAttempts: 3,
        expectedAction: RecoveryActionType.RETRY_PAYMENT, // matches baseline
        expectedRiskLevel: RiskLevel.LOW,
      },
      {
        id: "c2",
        name: "Case 2",
        amount: 200000,
        currency: "INR",
        paymentMethod: PaymentMethod.CARD,
        failureCategory: FailureCategory.EXPIRED_CARD,
        attemptCount: 1,
        customerLifetimeValue: 0,
        customerSuccessfulPayments: 0,
        customerFailedPayments: 1,
        merchantAutoRecoveryEnabled: true,
        merchantConfidenceThreshold: 0.8,
        merchantMaxRetryAttempts: 3,
        expectedAction: RecoveryActionType.WAIT, // intentionally different from baseline's REQUEST_PAYMENT_METHOD_UPDATE
        expectedRiskLevel: RiskLevel.LOW,
      },
    ];

    const report = runEvaluation(syntheticCases, provider);
    expect(report.metrics.totalCases).toBe(2);
    expect(report.metrics.actionAccuracy).toBe(50.0); // 1 of 2 matches
    expect(report.metrics.riskAccuracy).toBe(100.0); // 2 of 2 match
  });

  it("produces deterministic and reproducible results across consecutive runs", () => {
    const run1 = runEvaluation(EVALUATION_DATASET, provider);
    const run2 = runEvaluation(EVALUATION_DATASET, provider);

    expect(run1.metrics.actionAccuracy).toBe(run2.metrics.actionAccuracy);
    expect(run1.metrics.riskAccuracy).toBe(run2.metrics.riskAccuracy);
    expect(run1.metrics.totalRevenueAtRisk).toBe(run2.metrics.totalRevenueAtRisk);
    expect(run1.metrics.totalExpectedRecoverable).toBe(run2.metrics.totalExpectedRecoverable);
    expect(run1.predictions.length).toBe(run2.predictions.length);
  });
});
