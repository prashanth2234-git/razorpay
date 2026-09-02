import { RecoveryActionType, RiskLevel } from "@prisma/client";
import { EvaluationCase, EVALUATION_DATASET, EVALUATION_DATASET_VERSION } from "./evaluation-dataset";
import { createDeterministicDiagnosis, PaymentAnalysisInput } from "./claude";
import { evaluateAiRecoveryRecommendation, AiPolicyStatus } from "../recovery/ai-policy";

export { type EvaluationCase, EVALUATION_DATASET, EVALUATION_DATASET_VERSION };

export interface EvaluationPrediction {
  caseId: string;
  predictedAction: RecoveryActionType;
  predictedRiskLevel: RiskLevel;
  confidence: number;
  recoveryProbability: number;
  expectedRecoveryAmount: number; // in paise
  isPolicyCompatible: boolean;
  policyStatus: AiPolicyStatus;
  policyPermittedAction: RecoveryActionType;
  policyReason: string;
  isFailed?: boolean;
  failureReason?: string;
}

export interface EvaluationMetrics {
  totalCases: number;
  successfulCases: number;
  failedCases: number;
  actionAccuracy: number; // percentage (0.0 - 100.0)
  riskAccuracy: number; // percentage (0.0 - 100.0)
  policyCompatibilityRate: number; // percentage (0.0 - 100.0)
  policyRejectionRate: number; // percentage (0.0 - 100.0)
  highRiskEscalationRate: number; // percentage (0.0 - 100.0)
  totalRevenueAtRisk: number; // in paise
  totalExpectedRecoverable: number; // in paise
  totalHistoricalRecovered: number; // in paise
  historicalRecoveryRate: number; // percentage (0.0 - 100.0)
}

export interface EvaluationReport {
  datasetVersion: string;
  providerName: string;
  evaluatedAt: string;
  metrics: EvaluationMetrics;
  predictions: EvaluationPrediction[];
}

/**
 * Interface allowing different recovery predictors (e.g. Deterministic Baseline vs Claude live test harness)
 * to be plugged into the evaluation engine.
 */
export interface AiEvaluationProvider {
  name: string;
  predict(evalCase: EvaluationCase): EvaluationPrediction | Promise<EvaluationPrediction>;
}

/**
 * Baseline deterministic evaluation predictor utilizing authoritative recovery category rules and policy engine.
 */
export class DeterministicBaselinePredictor implements AiEvaluationProvider {
  name = "deterministic-baseline";

  predict(evalCase: EvaluationCase): EvaluationPrediction {
    const analysisInput: PaymentAnalysisInput = {
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

    // 1. Generate diagnosis from deterministic rule engine
    const diagnosis = createDeterministicDiagnosis(analysisInput);

    // 2. Evaluate recommendation through bounded recovery policy
    const policyDecision = evaluateAiRecoveryRecommendation({
      aiRecommendation: diagnosis,
      failureCategory: evalCase.failureCategory,
      attemptCount: evalCase.attemptCount,
      merchantAutoRecoveryEnabled: evalCase.merchantAutoRecoveryEnabled,
      merchantConfidenceThreshold: evalCase.merchantConfidenceThreshold,
      merchantMaxRetryAttempts: evalCase.merchantMaxRetryAttempts,
    });

    const expectedRecoveryAmount = Math.round(
      evalCase.amount * diagnosis.recoveryProbability
    );

    const isPolicyCompatible =
      policyDecision.status !== "AI_RECOMMENDATION_REJECTED";

    return {
      caseId: evalCase.id,
      predictedAction: diagnosis.recommendedAction as RecoveryActionType,
      predictedRiskLevel: diagnosis.riskLevel as RiskLevel,
      confidence: diagnosis.confidence,
      recoveryProbability: diagnosis.recoveryProbability,
      expectedRecoveryAmount,
      isPolicyCompatible,
      policyStatus: policyDecision.status,
      policyPermittedAction: policyDecision.policyPermittedAction,
      policyReason: policyDecision.policyReason,
    };
  }
}

/**
 * Computes metrics given a dataset and corresponding predictions.
 */
export function computeEvaluationMetrics(
  cases: EvaluationCase[],
  predictions: EvaluationPrediction[],
  providerName: string,
  datasetVersion: string = EVALUATION_DATASET_VERSION
): EvaluationReport {
  const totalCases = cases.length;

  if (totalCases === 0) {
    return {
      datasetVersion,
      providerName,
      evaluatedAt: new Date().toISOString(),
      metrics: {
        totalCases: 0,
        successfulCases: 0,
        failedCases: 0,
        actionAccuracy: 0,
        riskAccuracy: 0,
        policyCompatibilityRate: 0,
        policyRejectionRate: 0,
        highRiskEscalationRate: 0,
        totalRevenueAtRisk: 0,
        totalExpectedRecoverable: 0,
        totalHistoricalRecovered: 0,
        historicalRecoveryRate: 0,
      },
      predictions: [],
    };
  }

  let successfulCases = 0;
  let failedCases = 0;

  let correctActions = 0;
  let riskEvaluatedCount = 0;
  let correctRisks = 0;
  let policyCompatibleCount = 0;
  let policyRejectionsCount = 0;
  let highRiskEscalationsCount = 0;

  let totalRevenueAtRisk = 0;
  let totalExpectedRecoverable = 0;
  let totalHistoricalRecovered = 0;
  let historicalDecidedCount = 0;
  let historicalSuccessCount = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const pred = predictions[i];

    totalRevenueAtRisk += c.amount;

    if (c.historicalOutcome) {
      historicalDecidedCount++;
      if (c.historicalOutcome === "RECOVERED") {
        historicalSuccessCount++;
      }
    }
    if (c.historicalRecoveredAmount) {
      totalHistoricalRecovered += c.historicalRecoveredAmount;
    }

    if (pred.isFailed) {
      failedCases++;
      continue;
    }

    successfulCases++;
    totalExpectedRecoverable += pred.expectedRecoveryAmount;

    // 1. Action accuracy
    if (pred.predictedAction === c.expectedAction) {
      correctActions++;
    }

    // 2. Risk accuracy
    if (c.expectedRiskLevel) {
      riskEvaluatedCount++;
      if (pred.predictedRiskLevel === c.expectedRiskLevel) {
        correctRisks++;
      }
    }

    // 3. Policy metrics
    if (pred.isPolicyCompatible) {
      policyCompatibleCount++;
    }
    if (pred.policyStatus === "AI_RECOMMENDATION_REJECTED") {
      policyRejectionsCount++;
    }
    if (pred.policyStatus === "AI_RECOMMENDATION_ESCALATED") {
      highRiskEscalationsCount++;
    }
  }

  const actionAccuracy =
    totalCases > 0 ? Math.round((correctActions / totalCases) * 1000) / 10 : 0.0;
  const riskAccuracy =
    riskEvaluatedCount > 0
      ? Math.round((correctRisks / riskEvaluatedCount) * 1000) / 10
      : 100.0;
  const policyCompatibilityRate =
    totalCases > 0
      ? Math.round((policyCompatibleCount / totalCases) * 1000) / 10
      : 0.0;
  const policyRejectionRate =
    totalCases > 0
      ? Math.round((policyRejectionsCount / totalCases) * 1000) / 10
      : 0.0;
  const highRiskEscalationRate =
    totalCases > 0
      ? Math.round((highRiskEscalationsCount / totalCases) * 1000) / 10
      : 0.0;
  const historicalRecoveryRate =
    historicalDecidedCount > 0
      ? Math.round((historicalSuccessCount / historicalDecidedCount) * 1000) / 10
      : 0.0;

  return {
    datasetVersion,
    providerName,
    evaluatedAt: new Date().toISOString(),
    metrics: {
      totalCases,
      successfulCases,
      failedCases,
      actionAccuracy,
      riskAccuracy,
      policyCompatibilityRate,
      policyRejectionRate,
      highRiskEscalationRate,
      totalRevenueAtRisk,
      totalExpectedRecoverable,
      totalHistoricalRecovered,
      historicalRecoveryRate,
    },
    predictions,
  };
}

/**
 * Runs synchronous offline evaluation against an evaluation dataset.
 */
export function runEvaluation(
  cases: EvaluationCase[] = EVALUATION_DATASET,
  provider: AiEvaluationProvider = new DeterministicBaselinePredictor(),
  datasetVersion: string = EVALUATION_DATASET_VERSION
): EvaluationReport {
  const predictions: EvaluationPrediction[] = [];
  for (const c of cases) {
    const res = provider.predict(c);
    if (res instanceof Promise) {
      throw new Error("Async provider used in synchronous runEvaluation. Use runEvaluationAsync instead.");
    }
    predictions.push(res);
  }

  return computeEvaluationMetrics(cases, predictions, provider.name, datasetVersion);
}

/**
 * Runs asynchronous offline evaluation against an evaluation dataset (supporting live AI APIs).
 */
export async function runEvaluationAsync(
  cases: EvaluationCase[] = EVALUATION_DATASET,
  provider: AiEvaluationProvider = new DeterministicBaselinePredictor(),
  datasetVersion: string = EVALUATION_DATASET_VERSION
): Promise<EvaluationReport> {
  const predictions: EvaluationPrediction[] = [];
  for (const c of cases) {
    const res = await provider.predict(c);
    predictions.push(res);
  }

  return computeEvaluationMetrics(cases, predictions, provider.name, datasetVersion);
}
