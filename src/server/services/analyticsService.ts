import { db } from "@/lib/db";
import { PaymentStatus, RecoveryStatus } from "@prisma/client";

export interface DashboardSummary {
  totalRevenue: number; // in paise
  revenueRecovered: number; // in paise
  recoveryRate: number; // percentage (0 - 100)
  failedPaymentsCount: number;
  aiInterventionsCount: number;
  pendingRecoveriesCount: number;
  totalPaymentsCount: number;
}

export interface RecentAiDecision {
  id: string;
  paymentId: string;
  providerPaymentId: string | null;
  customerName: string;
  amount: number; // in paise
  currency: string;
  diagnosis: string;
  confidence: number;
  recoveryProbability: number;
  recommendedAction: string;
  reasoning: string;
  riskLevel: string;
  createdAt: Date;
}

export async function getDashboardSummary(merchantId: string): Promise<DashboardSummary> {
  const [
    successRevenueSum,
    recoveredRevenueSum,
    failedPaymentsCount,
    recoveredPaymentsCount,
    aiInterventionsCount,
    pendingRecoveriesCount,
    totalPaymentsCount,
  ] = await Promise.all([
    // Total captured revenue (Success + Recovered)
    db.payment.aggregate({
      where: {
        merchantId,
        status: { in: [PaymentStatus.SUCCESS, PaymentStatus.RECOVERED] },
      },
      _sum: { amount: true },
    }),
    // Total recovered amount
    db.recoveryAttempt.aggregate({
      where: {
        recoveryAction: { payment: { merchantId } },
        status: RecoveryStatus.EXECUTED,
      },
      _sum: { recoveredAmount: true },
    }),
    // Count of failed payments
    db.payment.count({
      where: {
        merchantId,
        status: PaymentStatus.FAILED,
      },
    }),
    // Count of recovered payments
    db.payment.count({
      where: {
        merchantId,
        status: PaymentStatus.RECOVERED,
      },
    }),
    // AI Interventions count
    db.aiAnalysis.count({
      where: {
        payment: { merchantId },
      },
    }),
    // Pending recovery actions
    db.recoveryAction.count({
      where: {
        payment: { merchantId },
        status: { in: [RecoveryStatus.RECOMMENDED, RecoveryStatus.PENDING_APPROVAL] },
      },
    }),
    // Total payment events
    db.payment.count({
      where: { merchantId },
    }),
  ]);

  const totalRevenue = (successRevenueSum._sum.amount || 0);
  const revenueRecovered = (recoveredRevenueSum._sum.recoveredAmount || 0);

  // Recovery Rate calculation
  const totalFailures = failedPaymentsCount + recoveredPaymentsCount;
  const recoveryRate =
    totalFailures > 0 ? (recoveredPaymentsCount / totalFailures) * 100 : 0;

  return {
    totalRevenue,
    revenueRecovered,
    recoveryRate: Math.round(recoveryRate * 10) / 10,
    failedPaymentsCount,
    aiInterventionsCount,
    pendingRecoveriesCount,
    totalPaymentsCount,
  };
}

export async function getRecentAiDecisions(
  merchantId: string,
  limit = 5
): Promise<RecentAiDecision[]> {
  const analyses = await db.aiAnalysis.findMany({
    where: {
      payment: {
        merchantId, // strictly merchant-scoped
      },
    },
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      payment: {
        select: {
          id: true,
          providerPaymentId: true,
          amount: true,
          currency: true,
          customer: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return analyses.map((a) => ({
    id: a.id,
    paymentId: a.paymentId,
    providerPaymentId: a.payment.providerPaymentId,
    customerName: a.payment.customer.name,
    amount: a.payment.amount,
    currency: a.payment.currency,
    diagnosis: a.diagnosis,
    confidence: a.confidence,
    recoveryProbability: a.recoveryProbability,
    recommendedAction: a.recommendedAction,
    reasoning: a.reasoning,
    riskLevel: a.riskLevel,
    createdAt: a.createdAt,
  }));
}
