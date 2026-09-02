import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiEvaluationProvider } from "./gemini-evaluation";
import {
  runEvaluationAsync,
  EVALUATION_DATASET,
  EVALUATION_DATASET_VERSION,
  EvaluationCase,
} from "./evaluation";
import * as geminiModule from "./gemini";
import { FailureCategory, PaymentMethod, RecoveryActionType, RiskLevel } from "@prisma/client";

vi.mock("./gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof geminiModule>();
  return {
    ...actual,
    isGeminiConfigured: vi.fn(),
    analyzePaymentWithGemini: vi.fn(),
  };
});

describe("Gemini Offline AI Evaluation Provider (Milestone 5 Step 11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleCase: EvaluationCase = {
    id: "eval_test_gemini_01",
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

  it("converts EvaluationCase into PaymentAnalysisInput and maps successful Gemini response into EvaluationPrediction", async () => {
    vi.mocked(geminiModule.isGeminiConfigured).mockReturnValue(true);
    vi.mocked(geminiModule.analyzePaymentWithGemini).mockResolvedValue({
      success: true,
      model: "gemini-3.6-flash",
      data: {
        diagnosis: "Transient network failure between issuing switch and merchant bank.",
        confidence: 0.95,
        recoveryProbability: 0.90,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Customer has clean payment history and failure is non-terminal.",
      },
    });

    const provider = new GeminiEvaluationProvider();
    const prediction = await provider.predict(sampleCase);

    expect(prediction.caseId).toBe("eval_test_gemini_01");
    expect(prediction.predictedAction).toBe(RecoveryActionType.RETRY_PAYMENT);
    expect(prediction.predictedRiskLevel).toBe(RiskLevel.LOW);
    expect(prediction.confidence).toBe(0.95);
    expect(prediction.recoveryProbability).toBe(0.90);
    expect(prediction.expectedRecoveryAmount).toBe(450000); // 500000 * 0.90
    expect(prediction.isPolicyCompatible).toBe(true);
    expect(prediction.policyStatus).toBe("AI_RECOMMENDATION_ACCEPTED");
    expect(prediction.isFailed).toBe(false);

    expect(geminiModule.analyzePaymentWithGemini).toHaveBeenCalledWith({
      paymentId: "eval_test_gemini_01",
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

  it("handles controlled Gemini API error gracefully without throwing", async () => {
    vi.mocked(geminiModule.isGeminiConfigured).mockReturnValue(true);
    vi.mocked(geminiModule.analyzePaymentWithGemini).mockResolvedValue({
      success: false,
      code: "API_ERROR",
      error: "Google GenAI quota exceeded.",
      model: "gemini-3.6-flash",
    });

    const provider = new GeminiEvaluationProvider();
    const prediction = await provider.predict(sampleCase);

    expect(prediction.isFailed).toBe(true);
    expect(prediction.failureReason).toBe("Google GenAI quota exceeded.");
    expect(prediction.isPolicyCompatible).toBe(false);
  });

  it("handles missing GEMINI_API_KEY gracefully with informative failure message", async () => {
    vi.mocked(geminiModule.isGeminiConfigured).mockReturnValue(false);

    const provider = new GeminiEvaluationProvider();
    const prediction = await provider.predict(sampleCase);

    expect(prediction.isFailed).toBe(true);
    expect(prediction.failureReason).toContain("GEMINI_API_KEY is not configured");
    expect(geminiModule.analyzePaymentWithGemini).not.toHaveBeenCalled();
  });

  it("runs async evaluation over dataset and computes accurate report metrics with mocked Gemini responses", async () => {
    vi.mocked(geminiModule.isGeminiConfigured).mockReturnValue(true);
    vi.mocked(geminiModule.analyzePaymentWithGemini).mockResolvedValue({
      success: true,
      model: "gemini-3.6-flash",
      data: {
        diagnosis: "Evaluated payment recovery scenario with Gemini.",
        confidence: 0.92,
        recoveryProbability: 0.85,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Synthetic benchmark prediction via Gemini.",
      },
    });

    const provider = new GeminiEvaluationProvider();
    const report = await runEvaluationAsync(
      EVALUATION_DATASET.slice(0, 3),
      provider,
      EVALUATION_DATASET_VERSION
    );

    expect(report.providerName).toBe("gemini");
    expect(report.metrics.totalCases).toBe(3);
    expect(report.metrics.successfulCases).toBe(3);
    expect(report.metrics.failedCases).toBe(0);
    expect(report.metrics.totalRevenueAtRisk).toBeGreaterThan(0);
    expect(report.predictions.length).toBe(3);
  });
});
