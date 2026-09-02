import { FailureCategory, RiskLevel, RecoveryActionType } from "@prisma/client";

export interface RecoveryScoringInput {
  amount: number; // in paise
  recoveryProbability: number; // 0.0 - 1.0
  riskLevel: RiskLevel;
  failureCategory?: FailureCategory | null;
  recommendedAction?: RecoveryActionType | null;
  attemptCount?: number;
  customerSuccessfulPayments?: number;
  customerFailedPayments?: number;
}

export interface RecoveryOpportunityScore {
  score: number; // 0 - 100
  priority: "HIGH" | "MEDIUM" | "LOW";
  expectedRecoveryAmount: number; // in paise
  scoreBreakdown: {
    probabilityComponent: number;
    amountComponent: number;
    riskAdjustment: number;
    customerHistoryAdjustment: number;
    attemptPenalty: number;
  };
}

/**
 * Calculates a deterministic recovery opportunity score to rank actionable revenue recovery opportunities.
 */
export function calculateRecoveryOpportunity(
  input: RecoveryScoringInput
): RecoveryOpportunityScore {
  const prob = Math.min(1, Math.max(0, input.recoveryProbability));
  const amountRupees = Math.max(1, input.amount / 100);
  const attempts = Math.max(0, input.attemptCount || 0);

  // 1. Probability component: 0 - 50 points
  const probabilityComponent = Math.round(prob * 50);

  // 2. Amount scale component: 0 - 25 points (logarithmic scale)
  // e.g. ₹500 -> ~12 pts, ₹5,000 -> ~18 pts, ₹50,000+ -> 25 pts
  const amountComponent = Math.min(25, Math.max(5, Math.round(Math.log10(amountRupees) * 6)));

  // 3. Risk adjustment: LOW (+15), MEDIUM (+5), HIGH (-10)
  let riskAdjustment = 5;
  if (input.riskLevel === RiskLevel.LOW) riskAdjustment = 15;
  else if (input.riskLevel === RiskLevel.MEDIUM) riskAdjustment = 5;
  else if (input.riskLevel === RiskLevel.HIGH) riskAdjustment = -10;

  // 4. Customer history adjustment: -5 to +10 points
  const successCount = input.customerSuccessfulPayments || 0;
  const failCount = input.customerFailedPayments || 0;
  let customerHistoryAdjustment = 0;
  if (successCount >= 5) customerHistoryAdjustment = 10;
  else if (successCount >= 1) customerHistoryAdjustment = 5;
  else if (failCount > 2 && successCount === 0) customerHistoryAdjustment = -5;

  // 5. Attempt penalty: -10 points per prior failed attempt
  const attemptPenalty = Math.min(30, attempts * 10);

  // Compute total clamped score (0 - 100)
  const rawScore =
    probabilityComponent +
    amountComponent +
    riskAdjustment +
    customerHistoryAdjustment -
    attemptPenalty;

  const score = Math.min(100, Math.max(0, rawScore));

  // Determine Priority tier
  let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  if (score >= 70) {
    priority = "HIGH";
  } else if (score >= 40) {
    priority = "MEDIUM";
  } else {
    priority = "LOW";
  }

  // Expected recovered value (Amount * Probability)
  const expectedRecoveryAmount = Math.round(input.amount * prob);

  return {
    score,
    priority,
    expectedRecoveryAmount,
    scoreBreakdown: {
      probabilityComponent,
      amountComponent,
      riskAdjustment,
      customerHistoryAdjustment,
      attemptPenalty,
    },
  };
}
