import { RecoveryActionType, RiskLevel } from "@prisma/client";
import {
  AiEvaluationProvider,
  EvaluationCase,
  EvaluationPrediction,
} from "./evaluation";
import {
  analyzePaymentWithClaude,
  isClaudeConfigured,
  PaymentAnalysisInput,
} from "./claude";
import { evaluateAiRecoveryRecommendation } from "../recovery/ai-policy";

/**
 * Opt-in Claude AI evaluation provider for benchmarking real LLM recovery decisions
 * against the versioned evaluation dataset in complete isolation from production DB state.
 */
export class ClaudeEvaluationProvider implements AiEvaluationProvider {
  name = "claude";

  async predict(evalCase: EvaluationCase): Promise<EvaluationPrediction> {
    if (!isClaudeConfigured()) {
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
        policyReason: "Claude evaluation unavailable: CLAUDE_API_KEY is not configured.",
        isFailed: true,
        failureReason: "CLAUDE_API_KEY is not configured in environment.",
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

    const claudeResult = await analyzePaymentWithClaude(input);

    if (!claudeResult.success) {
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
        policyReason: `Claude analysis failed: ${claudeResult.error}`,
        isFailed: true,
        failureReason: claudeResult.error,
      };
    }

    // Pass Claude's raw recommendation through deterministic policy engine
    const policyDecision = evaluateAiRecoveryRecommendation({
      aiRecommendation: claudeResult.data,
      failureCategory: evalCase.failureCategory,
      attemptCount: evalCase.attemptCount,
      merchantAutoRecoveryEnabled: evalCase.merchantAutoRecoveryEnabled,
      merchantConfidenceThreshold: evalCase.merchantConfidenceThreshold,
      merchantMaxRetryAttempts: evalCase.merchantMaxRetryAttempts,
    });

    const expectedRecoveryAmount = Math.round(
      evalCase.amount * claudeResult.data.recoveryProbability
    );

    const isPolicyCompatible =
      policyDecision.status !== "AI_RECOMMENDATION_REJECTED";

    return {
      caseId: evalCase.id,
      predictedAction: claudeResult.data.recommendedAction as RecoveryActionType,
      predictedRiskLevel: claudeResult.data.riskLevel as RiskLevel,
      confidence: claudeResult.data.confidence,
      recoveryProbability: claudeResult.data.recoveryProbability,
      expectedRecoveryAmount,
      isPolicyCompatible,
      policyStatus: policyDecision.status,
      policyPermittedAction: policyDecision.policyPermittedAction,
      policyReason: policyDecision.policyReason,
      isFailed: false,
    };
  }
}
