import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeEvaluationProvider } from "./claude-evaluation";
import {
  runEvaluationAsync,
  DeterministicBaselinePredictor,
  EVALUATION_DATASET,
  EVALUATION_DATASET_VERSION,
  EvaluationCase,
} from "./evaluation";
import * as claudeModule from "./claude";
import { FailureCategory, PaymentMethod, RecoveryActionType, RiskLevel } from "@prisma/client";

vi.mock("./claude", async (importOriginal) => {
  const actual = await importOriginal<typeof claudeModule>();
  return {
    ...actual,
    isClaudeConfigured: vi.fn(),
    analyzePaymentWithClaude: vi.fn(),
  };
});

describe("Claude Offline AI Evaluation Provider (Milestone 5 Step 10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleCase: EvaluationCase = {
    id: "eval_test_01",
    name: "Temporary Issuer Drop",
    amount: 500000, // ₹5,000
    currency: "INR",
    paymentMethod: PaymentMethod.UPI,
    failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
    attemptCount: 1,
    customerLifetimeValue: 2500000,
    customerSuccessfulPayments: 5,
    customerFailedPayments: 0,
    merchantAutoRecoveryEnabled: true,
    merchantConfidenceThreshold: 0.8,
    merchantMaxRetryAttempts: 3,
    expectedAction: RecoveryActionType.RETRY_PAYMENT,
    expectedRiskLevel: RiskLevel.LOW,
    historicalOutcome: "RECOVERED",
    historicalRecoveredAmount: 500000,
  };

  it("converts EvaluationCase into PaymentAnalysisInput and maps successful Claude response into EvaluationPrediction", async () => {
    vi.mocked(claudeModule.isClaudeConfigured).mockReturnValue(true);
    vi.mocked(claudeModule.analyzePaymentWithClaude).mockResolvedValue({
      success: true,
      model: "claude-3-7-sonnet-20250219",
      data: {
        diagnosis: "Transient network failure between issuing switch and merchant bank.",
        confidence: 0.95,
        recoveryProbability: 0.90,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Customer has clean payment history and failure is non-terminal.",
      },
    });

    const provider = new ClaudeEvaluationProvider();
    const prediction = await provider.predict(sampleCase);

    expect(prediction.caseId).toBe("eval_test_01");
    expect(prediction.predictedAction).toBe(RecoveryActionType.RETRY_PAYMENT);
    expect(prediction.predictedRiskLevel).toBe(RiskLevel.LOW);
    expect(prediction.confidence).toBe(0.95);
    expect(prediction.recoveryProbability).toBe(0.90);
    expect(prediction.expectedRecoveryAmount).toBe(450000); // 500000 * 0.90
    expect(prediction.isPolicyCompatible).toBe(true);
    expect(prediction.policyStatus).toBe("AI_RECOMMENDATION_ACCEPTED");
    expect(prediction.isFailed).toBe(false);

    expect(claudeModule.analyzePaymentWithClaude).toHaveBeenCalledWith({
      paymentId: "eval_test_01",
      amount: 500000,
      currency: "INR",
      paymentMethod: PaymentMethod.UPI,
      paymentStatus: "FAILED",
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      failureMessage: undefined,
      failureCode: undefined,
      attemptCount: 1,
      customerLifetimeValue: 2500000,
      customerSuccessfulPaymentCount: 5,
      customerFailedPaymentCount: 0,
      merchantAutoRecoveryEnabled: true,
      merchantConfidenceThreshold: 0.8,
    });
  });

  it("handles controlled Claude API error gracefully without throwing", async () => {
    vi.mocked(claudeModule.isClaudeConfigured).mockReturnValue(true);
    vi.mocked(claudeModule.analyzePaymentWithClaude).mockResolvedValue({
      success: false,
      code: "API_ERROR",
      error: "Anthropic rate limit exceeded.",
      model: "claude-3-7-sonnet-20250219",
    });

    const provider = new ClaudeEvaluationProvider();
    const prediction = await provider.predict(sampleCase);

    expect(prediction.isFailed).toBe(true);
    expect(prediction.failureReason).toBe("Anthropic rate limit exceeded.");
    expect(prediction.isPolicyCompatible).toBe(false);
  });

  it("handles missing CLAUDE_API_KEY gracefully with informative failure message", async () => {
    vi.mocked(claudeModule.isClaudeConfigured).mockReturnValue(false);

    const provider = new ClaudeEvaluationProvider();
    const prediction = await provider.predict(sampleCase);

    expect(prediction.isFailed).toBe(true);
    expect(prediction.failureReason).toContain("CLAUDE_API_KEY is not configured");
    expect(claudeModule.analyzePaymentWithClaude).not.toHaveBeenCalled();
  });

  it("runs async evaluation over dataset and computes accurate report metrics with mocked Claude responses", async () => {
    vi.mocked(claudeModule.isClaudeConfigured).mockReturnValue(true);
    vi.mocked(claudeModule.analyzePaymentWithClaude).mockResolvedValue({
      success: true,
      model: "claude-3-7-sonnet-20250219",
      data: {
        diagnosis: "Evaluated payment recovery scenario.",
        confidence: 0.92,
        recoveryProbability: 0.85,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Synthetic benchmark prediction.",
      },
    });

    const provider = new ClaudeEvaluationProvider();
    const report = await runEvaluationAsync(
      EVALUATION_DATASET.slice(0, 3),
      provider,
      EVALUATION_DATASET_VERSION
    );

    expect(report.providerName).toBe("claude");
    expect(report.metrics.totalCases).toBe(3);
    expect(report.metrics.successfulCases).toBe(3);
    expect(report.metrics.failedCases).toBe(0);
    expect(report.metrics.totalRevenueAtRisk).toBeGreaterThan(0);
    expect(report.predictions.length).toBe(3);
  });

  it("enables side-by-side comparison between deterministic baseline and Claude provider", async () => {
    vi.mocked(claudeModule.isClaudeConfigured).mockReturnValue(true);
    vi.mocked(claudeModule.analyzePaymentWithClaude).mockResolvedValue({
      success: true,
      model: "claude-3-7-sonnet-20250219",
      data: {
        diagnosis: "Mock diagnosis",
        confidence: 0.90,
        recoveryProbability: 0.80,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Mock reasoning",
      },
    });

    const baselineProvider = new DeterministicBaselinePredictor();
    const claudeProvider = new ClaudeEvaluationProvider();

    const baselineReport = await runEvaluationAsync(
      [sampleCase],
      baselineProvider
    );
    const claudeReport = await runEvaluationAsync(
      [sampleCase],
      claudeProvider
    );

    expect(baselineReport.providerName).toBe("deterministic-baseline");
    expect(claudeReport.providerName).toBe("claude");
    expect(baselineReport.metrics.totalCases).toBe(claudeReport.metrics.totalCases);
  });
});
