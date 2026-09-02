import { RecoveryActionType, RiskLevel } from "@prisma/client";
import {
  AiEvaluationProvider,
  EvaluationCase,
  EvaluationPrediction,
} from "./evaluation";
import {
  analyzePaymentWithGemini,
  isGeminiConfigured,
} from "./gemini";
import { PaymentAnalysisInput } from "./claude";
import { evaluateAiRecoveryRecommendation } from "../recovery/ai-policy";

/**
 * Opt-in Gemini AI evaluation provider for benchmarking Gemini model decisions
 * against the versioned offline evaluation dataset in complete isolation from production DB state.
 */
export class GeminiEvaluationProvider implements AiEvaluationProvider {
  name = "gemini";

  async predict(evalCase: EvaluationCase): Promise<EvaluationPrediction> {
    if (!isGeminiConfigured()) {
      return {
        caseId: evalCase.id,
        predictedAction: RecoveryActionType.ESCALATE,
        predictedRiskLevel: RiskLevel.HIGH,
        confidence: 0,
        recoveryProbability: 0,
        expectedRecoveryAmount: 0,
        isPolicyCompatible: false,
        policyStatus: "AI_RECOMMENDATION_REJECTED",
        policyPermittedAction: RecoveryActionType.ESCALATE,
        policyReason: "Gemini evaluation unavailable: GEMINI_API_KEY is not configured.",
        isFailed: true,
        failureReason: "GEMINI_API_KEY is not configured in environment.",
      };
    }

    const input: PaymentAnalysisInput = {
      paymentId: evalCase.id,
      amount: evalCase.amount,
      currency: evalCase.currency,
      paymentMethod: evalCase.paymentMethod,
      paymentStatus: "FAILED",
      failureCategory: evalCase.failureCategory,
      failureMessage: evalCase.failureMessage,
      failureCode: evalCase.failureCode,
      attemptCount: evalCase.attemptCount,
      customerLifetimeValue: evalCase.customerLifetimeValue,
      customerSuccessfulPaymentCount: evalCase.customerSuccessfulPayments,
      customerFailedPaymentCount: evalCase.customerFailedPayments,
      merchantAutoRecoveryEnabled: evalCase.merchantAutoRecoveryEnabled,
      merchantConfidenceThreshold: evalCase.merchantConfidenceThreshold,
    };

    const geminiResult = await analyzePaymentWithGemini(input);

    if (!geminiResult.success) {
      return {
        caseId: evalCase.id,
        predictedAction: RecoveryActionType.ESCALATE,
        predictedRiskLevel: RiskLevel.HIGH,
        confidence: 0,
        recoveryProbability: 0,
        expectedRecoveryAmount: 0,
        isPolicyCompatible: false,
        policyStatus: "AI_RECOMMENDATION_REJECTED",
        policyPermittedAction: RecoveryActionType.ESCALATE,
        policyReason: `Gemini analysis failed: ${geminiResult.error}`,
        isFailed: true,
        failureReason: geminiResult.error,
      };
    }

    // Pass Gemini's recommendation through deterministic policy engine
    const policyDecision = evaluateAiRecoveryRecommendation({
      aiRecommendation: geminiResult.data,
      failureCategory: evalCase.failureCategory,
      attemptCount: evalCase.attemptCount,
      merchantAutoRecoveryEnabled: evalCase.merchantAutoRecoveryEnabled,
      merchantConfidenceThreshold: evalCase.merchantConfidenceThreshold,
      merchantMaxRetryAttempts: evalCase.merchantMaxRetryAttempts,
    });

    const expectedRecoveryAmount = Math.round(
      evalCase.amount * geminiResult.data.recoveryProbability
    );

    const isPolicyCompatible =
      policyDecision.status !== "AI_RECOMMENDATION_REJECTED";

    return {
      caseId: evalCase.id,
      predictedAction: geminiResult.data.recommendedAction as RecoveryActionType,
      predictedRiskLevel: geminiResult.data.riskLevel as RiskLevel,
      confidence: geminiResult.data.confidence,
      recoveryProbability: geminiResult.data.recoveryProbability,
      expectedRecoveryAmount,
      isPolicyCompatible,
      policyStatus: policyDecision.status,
      policyPermittedAction: policyDecision.policyPermittedAction,
      policyReason: policyDecision.policyReason,
      isFailed: false,
    };
  }
}
