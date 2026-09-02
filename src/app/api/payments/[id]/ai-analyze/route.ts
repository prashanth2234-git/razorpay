import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/lib/db";
import {
  analyzePaymentWithClaude,
  PaymentAnalysisInput,
} from "@/server/ai/claude";
import {
  ActorType,
  AuditEventType,
  RecoveryActionType,
  RiskLevel,
} from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate session
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: paymentId } = await params;

    // 2. Load payment scoped strictly to the authenticated user's merchant
    const payment = await db.payment.findFirst({
      where: {
        id: paymentId,
        merchantId: user.merchantId, // strictly merchant-scoped
      },
      include: {
        customer: true,
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
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: `Payment with ID '${paymentId}' not found for this merchant.` },
        { status: 404 }
      );
    }

    // 3. Construct structured PaymentAnalysisInput
    const latestFailure = payment.failures[0];
    const input: PaymentAnalysisInput = {
      paymentId: payment.id,
      providerPaymentId: payment.providerPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.method,
      paymentStatus: payment.status,
      failureCategory: latestFailure?.category || payment.failureCategory,
      failureMessage: latestFailure?.providerDescription || payment.description,
      failureCode: latestFailure?.providerCode,
      attemptCount: payment.attempts.length > 0 ? payment.attempts.length : 1,
      customerName: payment.customer.name,
      customerLifetimeValue: payment.customer.lifetimeValue,
      customerSuccessfulPaymentCount: payment.customer.successfulPaymentCount,
      customerFailedPaymentCount: payment.customer.failedPaymentCount,
      merchantAutoRecoveryEnabled: payment.merchant.autoRecoveryEnabled,
      merchantConfidenceThreshold: payment.merchant.confidenceThreshold,
    };

    // 4. Call Claude AI service
    const claudeResult = await analyzePaymentWithClaude(input);

    if (!claudeResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: claudeResult.error,
          code: claudeResult.code,
          model: claudeResult.model,
        },
        { status: 422 }
      );
    }

    // 5. Persist AiAnalysis record in PostgreSQL via Prisma
    const aiAnalysis = await db.aiAnalysis.create({
      data: {
        paymentId: payment.id,
        diagnosis: claudeResult.data.diagnosis,
        confidence: claudeResult.data.confidence,
        recoveryProbability: claudeResult.data.recoveryProbability,
        recommendedAction: claudeResult.data.recommendedAction as RecoveryActionType,
        riskLevel: claudeResult.data.riskLevel as RiskLevel,
        reasoning: claudeResult.data.reasoning,
        modelProvider: "anthropic",
        modelName: claudeResult.model,
        rawMetadata: {
          source: "claude_live",
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // 6. Record immutable AuditLog event for the merchant
    await db.auditLog.create({
      data: {
        merchantId: user.merchantId,
        userId: user.id,
        paymentId: payment.id,
        actorType: ActorType.SYSTEM,
        eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
        description: `Claude AI generated diagnosis: ${claudeResult.data.recommendedAction} (${(claudeResult.data.confidence * 100).toFixed(0)}% confidence, ${(claudeResult.data.recoveryProbability * 100).toFixed(0)}% recovery odds)`,
        metadata: {
          provider: "anthropic",
          model: claudeResult.model,
          confidence: claudeResult.data.confidence,
          recoveryProbability: claudeResult.data.recoveryProbability,
          recommendedAction: claudeResult.data.recommendedAction,
          riskLevel: claudeResult.data.riskLevel,
          analysisId: aiAnalysis.id,
        },
      },
    });

    // 7. Return structured diagnosis (advisory only - no payment status change, no recovery execution)
    return NextResponse.json({
      success: true,
      source: "claude",
      model: claudeResult.model,
      analysis: {
        id: aiAnalysis.id,
        diagnosis: aiAnalysis.diagnosis,
        confidence: aiAnalysis.confidence,
        recoveryProbability: aiAnalysis.recoveryProbability,
        recommendedAction: aiAnalysis.recommendedAction,
        riskLevel: aiAnalysis.riskLevel,
        reasoning: aiAnalysis.reasoning,
        modelName: aiAnalysis.modelName,
        createdAt: aiAnalysis.createdAt,
      },
    });
  } catch (error) {
    console.error("POST /api/payments/:id/ai-analyze error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to analyze payment failure with Claude";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
