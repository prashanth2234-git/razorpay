import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/lib/db";
import { evaluateAiRecoveryRecommendation } from "@/server/recovery/ai-policy";
import { FailureCategory, RecoveryActionType, RiskLevel } from "@prisma/client";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: recoveryActionId } = await params;

    // 2. Load recovery action scoped strictly to current merchant
    const action = await db.recoveryAction.findFirst({
      where: {
        id: recoveryActionId,
        payment: { merchantId: user.merchantId }, // strictly merchant-scoped
      },
      include: {
        payment: {
          include: {
            failures: {
              orderBy: { occurredAt: "desc" },
              take: 1,
            },
            attempts: {
              orderBy: { attemptNumber: "desc" },
            },
            merchant: {
              select: {
                autoRecoveryEnabled: true,
                confidenceThreshold: true,
                maxRetryAttempts: true,
              },
            },
          },
        },
        aiAnalysis: true,
      },
    });

    if (!action) {
      return NextResponse.json(
        { error: `Recovery action '${recoveryActionId}' not found for this merchant.` },
        { status: 404 }
      );
    }

    const latestFailure = action.payment.failures[0];
    const failureCategory = latestFailure?.category || action.payment.failureCategory || FailureCategory.UNKNOWN;
    const attemptCount = action.payment.attempts.length > 0 ? action.payment.attempts.length : 1;

    // 3. Resolve AI recommendation (from associated AiAnalysis record or action default)
    const aiRecommendation = action.aiAnalysis
      ? {
          recommendedAction: action.aiAnalysis.recommendedAction,
          confidence: action.aiAnalysis.confidence,
          recoveryProbability: action.aiAnalysis.recoveryProbability,
          riskLevel: action.aiAnalysis.riskLevel,
          diagnosis: action.aiAnalysis.diagnosis,
          reasoning: action.aiAnalysis.reasoning,
        }
      : {
          recommendedAction: action.actionType || RecoveryActionType.RETRY_PAYMENT,
          confidence: 0.90,
          recoveryProbability: 0.85,
          riskLevel: RiskLevel.LOW,
          diagnosis: "Baseline recovery recommendation",
          reasoning: "Action derived from initial transaction triage.",
        };

    // 4. Evaluate AI recommendation against authoritative deterministic policy
    const decision = evaluateAiRecoveryRecommendation({
      aiRecommendation,
      failureCategory,
      attemptCount,
      merchantAutoRecoveryEnabled: action.payment.merchant.autoRecoveryEnabled,
      merchantConfidenceThreshold: action.payment.merchant.confidenceThreshold,
      merchantMaxRetryAttempts: action.payment.merchant.maxRetryAttempts,
    });

    // 5. Return typed decision (strictly advisory/evaluative - no DB financial mutations)
    return NextResponse.json({
      success: true,
      recoveryActionId: action.id,
      paymentId: action.paymentId,
      decision,
    });
  } catch (error) {
    console.error("POST /api/recovery/:id/evaluate error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to evaluate recovery policy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
