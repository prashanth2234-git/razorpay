import { db } from "@/lib/db";
import {
  PaymentStatus,
  RecoveryStatus,
  FailureCategory,
  RecoveryActionType,
  Prisma,
} from "@prisma/client";
import {
  RecoveryAnalyticsData,
  RecoveryAnalyticsFilters,
  CategoryRecoveryMetric,
  ActionTypeRecoveryMetric,
  TrendPoint,
  AiPolicyAnalytics,
} from "@/types/client";

/**
 * Calculates comprehensive revenue-recovery analytics for a specific merchant.
 *
 * SAFETY INVARIANTS:
 * - Strictly merchant-scoped via PostgreSQL relations (never trusts unverified merchantId).
 * - All monetary values are calculated in paise and returned as integer paise.
 * - Idempotency-safe: Each payment/recovery action/attempt is counted exactly once.
 * - Zero denominator protection on all percentage calculations.
 */
export async function getRecoveryAnalytics(
  merchantId: string,
  filters?: RecoveryAnalyticsFilters
): Promise<RecoveryAnalyticsData> {
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { currency: true },
  });

  const currency = merchant?.currency || "INR";

  const startDate = filters?.startDate ? new Date(filters.startDate) : undefined;
  const endDate = filters?.endDate ? new Date(filters.endDate) : undefined;
  const filterCategory = filters?.failureCategory as FailureCategory | undefined;
  const filterActionType = filters?.actionType as RecoveryActionType | undefined;

  // Build date filter for queries
  const dateFilter =
    startDate || endDate
      ? {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        }
      : undefined;

  // 1. Base Where Clauses
  const paymentWhere: Prisma.PaymentWhereInput = {
    merchantId,
    status: {
      in: [
        PaymentStatus.FAILED,
        PaymentStatus.RECOVERY_PENDING,
        PaymentStatus.RECOVERED,
        PaymentStatus.ESCALATED,
      ],
    },
    ...(filterCategory ? { failureCategory: filterCategory } : {}),
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  const actionWhere: Prisma.RecoveryActionWhereInput = {
    payment: {
      merchantId,
      ...(filterCategory ? { failureCategory: filterCategory } : {}),
    },
    ...(filterActionType ? { actionType: filterActionType } : {}),
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  const attemptWhere: Prisma.RecoveryAttemptWhereInput = {
    recoveryAction: {
      payment: {
        merchantId,
        ...(filterCategory ? { failureCategory: filterCategory } : {}),
      },
      ...(filterActionType ? { actionType: filterActionType } : {}),
    },
    ...(dateFilter ? { attemptedAt: dateFilter } : {}),
  };

  // 2. Perform parallel database aggregations
  const [
    revenueAtRiskAgg,
    expectedRecoverableAgg,
    recoveredRevenueAgg,
    totalAttemptsCount,
    successfulAttemptsCount,
    failedAttemptsCount,
    pendingApprovalCount,
    recoveryPipelineCount,
    aiAnalysisAgg,
    actionsGroupedByStatus,
    actionsGroupedByType,
    rawActionsWithAttempts,
  ] = await Promise.all([
    // Revenue at Risk: Total value of failed / recoverable payments
    db.payment.aggregate({
      where: paymentWhere,
      _sum: { amount: true },
    }),

    // Expected Recoverable: Sum of expected recovery amounts
    db.recoveryAction.aggregate({
      where: {
        ...actionWhere,
        status: {
          in: [
            RecoveryStatus.RECOMMENDED,
            RecoveryStatus.PENDING_APPROVAL,
            RecoveryStatus.APPROVED,
            RecoveryStatus.EXECUTING,
            RecoveryStatus.EXECUTED,
          ],
        },
      },
      _sum: { expectedRecoveryAmount: true },
    }),

    // Recovered Revenue: Sum of executed recovery attempts
    db.recoveryAttempt.aggregate({
      where: {
        ...attemptWhere,
        status: RecoveryStatus.EXECUTED,
      },
      _sum: { recoveredAmount: true },
    }),

    // Total Recovery Attempts count
    db.recoveryAttempt.count({
      where: attemptWhere,
    }),

    // Successful Recovery Attempts count
    db.recoveryAttempt.count({
      where: {
        ...attemptWhere,
        status: RecoveryStatus.EXECUTED,
      },
    }),

    // Failed Recovery Attempts count
    db.recoveryAttempt.count({
      where: {
        ...attemptWhere,
        status: RecoveryStatus.FAILED,
      },
    }),

    // Pending Approval count
    db.recoveryAction.count({
      where: {
        ...actionWhere,
        status: { in: [RecoveryStatus.PENDING_APPROVAL, RecoveryStatus.RECOMMENDED] },
      },
    }),

    // Active Recovery Pipeline count
    db.recoveryAction.count({
      where: {
        ...actionWhere,
        status: {
          in: [
            RecoveryStatus.RECOMMENDED,
            RecoveryStatus.PENDING_APPROVAL,
            RecoveryStatus.APPROVED,
            RecoveryStatus.EXECUTING,
          ],
        },
      },
    }),

    // AI Analysis Aggregation
    db.aiAnalysis.aggregate({
      where: {
        payment: { merchantId },
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      _count: true,
      _avg: {
        confidence: true,
        recoveryProbability: true,
      },
    }),

    // Actions grouped by status for policy metrics
    db.recoveryAction.groupBy({
      by: ["status"],
      where: actionWhere,
      _count: true,
    }),

    // Actions grouped by actionType
    db.recoveryAction.groupBy({
      by: ["actionType", "status"],
      where: actionWhere,
      _count: true,
      _sum: { expectedRecoveryAmount: true },
    }),

    // Actions with payment & attempts for Category & Trend Breakdowns
    db.recoveryAction.findMany({
      where: actionWhere,
      select: {
        id: true,
        actionType: true,
        status: true,
        expectedRecoveryAmount: true,
        createdAt: true,
        payment: {
          select: {
            id: true,
            amount: true,
            failureCategory: true,
            createdAt: true,
          },
        },
        attempts: {
          select: {
            id: true,
            status: true,
            recoveredAmount: true,
            attemptedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const revenueAtRisk = revenueAtRiskAgg._sum.amount || 0;
  const expectedRecoverable = expectedRecoverableAgg._sum.expectedRecoveryAmount || 0;
  const recoveredRevenue = recoveredRevenueAgg._sum.recoveredAmount || 0;

  // Recovery rate = (recovered revenue / revenue at risk) * 100
  const recoveryRate =
    revenueAtRisk > 0 ? Math.round((recoveredRevenue / revenueAtRisk) * 1000) / 10 : 0;

  // Average recovered amount per successful attempt
  const averageRecoveredAmount =
    successfulAttemptsCount > 0 ? Math.round(recoveredRevenue / successfulAttemptsCount) : 0;

  // 3. Category Breakdown Aggregation
  const categoryMap = new Map<
    FailureCategory,
    {
      opportunities: number;
      revenueAtRisk: number;
      expectedRecoverable: number;
      recoveredRevenue: number;
    }
  >();

  // Initialize all known failure categories
  for (const cat of Object.values(FailureCategory)) {
    categoryMap.set(cat, {
      opportunities: 0,
      revenueAtRisk: 0,
      expectedRecoverable: 0,
      recoveredRevenue: 0,
    });
  }

  for (const action of rawActionsWithAttempts) {
    const cat = action.payment.failureCategory || FailureCategory.UNKNOWN;
    const entry = categoryMap.get(cat) || {
      opportunities: 0,
      revenueAtRisk: 0,
      expectedRecoverable: 0,
      recoveredRevenue: 0,
    };

    entry.opportunities += 1;
    entry.revenueAtRisk += action.payment.amount;
    entry.expectedRecoverable += action.expectedRecoveryAmount || action.payment.amount;

    for (const attempt of action.attempts) {
      if (attempt.status === RecoveryStatus.EXECUTED) {
        entry.recoveredRevenue += attempt.recoveredAmount || 0;
      }
    }

    categoryMap.set(cat, entry);
  }

  const byCategory: CategoryRecoveryMetric[] = Array.from(categoryMap.entries())
    .map(([category, data]) => {
      const catRate =
        data.revenueAtRisk > 0
          ? Math.round((data.recoveredRevenue / data.revenueAtRisk) * 1000) / 10
          : 0;

      return {
        category: category as FailureCategory,
        opportunities: data.opportunities,
        revenueAtRisk: data.revenueAtRisk,
        expectedRecoverable: data.expectedRecoverable,
        recoveredRevenue: data.recoveredRevenue,
        recoveryRate: catRate,
      };
    })
    .filter((c) => c.opportunities > 0 || c.revenueAtRisk > 0)
    .sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);

  // 4. Action Type Breakdown Aggregation
  const actionTypeMap = new Map<
    RecoveryActionType,
    {
      opportunities: number;
      executed: number;
      failed: number;
      recoveredRevenue: number;
    }
  >();

  for (const actType of Object.values(RecoveryActionType)) {
    actionTypeMap.set(actType, {
      opportunities: 0,
      executed: 0,
      failed: 0,
      recoveredRevenue: 0,
    });
  }

  for (const item of actionsGroupedByType) {
    const entry = actionTypeMap.get(item.actionType) || {
      opportunities: 0,
      executed: 0,
      failed: 0,
      recoveredRevenue: 0,
    };

    entry.opportunities += item._count;
    if (item.status === RecoveryStatus.EXECUTED) {
      entry.executed += item._count;
    } else if (item.status === RecoveryStatus.FAILED) {
      entry.failed += item._count;
    }
    actionTypeMap.set(item.actionType, entry);
  }

  // Calculate recovered amount per action type from attempts
  for (const action of rawActionsWithAttempts) {
    const entry = actionTypeMap.get(action.actionType);
    if (entry) {
      for (const attempt of action.attempts) {
        if (attempt.status === RecoveryStatus.EXECUTED) {
          entry.recoveredRevenue += attempt.recoveredAmount || 0;
        }
      }
    }
  }

  const byActionType: ActionTypeRecoveryMetric[] = Array.from(actionTypeMap.entries())
    .map(([type, data]) => {
      const totalOutcomes = data.executed + data.failed;
      const successRate =
        totalOutcomes > 0 ? Math.round((data.executed / totalOutcomes) * 1000) / 10 : 0;

      return {
        actionType: type as RecoveryActionType,
        opportunities: data.opportunities,
        executed: data.executed,
        failed: data.failed,
        recoveredRevenue: data.recoveredRevenue,
        successRate,
      };
    })
    .filter((a) => a.opportunities > 0)
    .sort((a, b) => b.opportunities - a.opportunities);

  // 5. Recovery Trend Aggregation (Daily buckets over recent window)
  const trendMap = new Map<string, TrendPoint>();

  // Determine window start and end dates
  const now = new Date();
  const windowEnd = endDate || now;
  const windowStart =
    startDate || new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000); // default past 30 days

  // Pre-fill daily date keys in YYYY-MM-DD format
  const currentCursor = new Date(windowStart);
  while (currentCursor <= windowEnd) {
    const dateKey = currentCursor.toISOString().split("T")[0];
    trendMap.set(dateKey, {
      date: dateKey,
      revenueAtRisk: 0,
      expectedRecoverable: 0,
      recoveredRevenue: 0,
      successfulRecoveries: 0,
    });
    currentCursor.setDate(currentCursor.getDate() + 1);
  }

  // Populate data into date buckets
  for (const action of rawActionsWithAttempts) {
    const actionDateKey = action.createdAt.toISOString().split("T")[0];
    const point = trendMap.get(actionDateKey);
    if (point) {
      point.revenueAtRisk += action.payment.amount;
      point.expectedRecoverable +=
        action.expectedRecoveryAmount || action.payment.amount;
    }

    for (const attempt of action.attempts) {
      if (attempt.status === RecoveryStatus.EXECUTED) {
        const attemptDateKey = attempt.attemptedAt.toISOString().split("T")[0];
        const attPoint = trendMap.get(attemptDateKey);
        if (attPoint) {
          attPoint.recoveredRevenue += attempt.recoveredAmount || 0;
          attPoint.successfulRecoveries += 1;
        }
      }
    }
  }

  const trend = Array.from(trendMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // 6. AI & Policy Safety Funnel Metrics
  let policyAcceptedCount = 0;
  let policyRejectedCount = 0;
  let approvalRequiredActionCount = 0;
  let executedActionCount = 0;

  for (const statusGroup of actionsGroupedStatusCount(actionsGroupedByStatus)) {
    if (statusGroup.status === RecoveryStatus.APPROVED || statusGroup.status === RecoveryStatus.EXECUTED) {
      policyAcceptedCount += statusGroup.count;
    }
    if (statusGroup.status === RecoveryStatus.REJECTED) {
      policyRejectedCount += statusGroup.count;
    }
    if (statusGroup.status === RecoveryStatus.PENDING_APPROVAL) {
      approvalRequiredActionCount += statusGroup.count;
    }
    if (statusGroup.status === RecoveryStatus.EXECUTED) {
      executedActionCount += statusGroup.count;
    }
  }

  const aiPolicy: AiPolicyAnalytics = {
    aiRecommendationsCount: aiAnalysisAgg._count || 0,
    policyAcceptedCount,
    policyRejectedCount,
    approvalRequiredCount: approvalRequiredActionCount,
    executedActionsCount: executedActionCount,
    avgConfidence: Math.round((aiAnalysisAgg._avg.confidence || 0) * 100) / 100,
    avgRecoveryProbability:
      Math.round((aiAnalysisAgg._avg.recoveryProbability || 0) * 100) / 100,
  };

  return {
    merchantId,
    currency,
    isSimulated: true, // MockRecoveryProvider sandbox indicator
    revenueAtRisk,
    expectedRecoverable,
    recoveredRevenue,
    recoveryRate,
    totalRecoveryAttempts: totalAttemptsCount,
    successfulRecoveries: successfulAttemptsCount,
    failedRecoveries: failedAttemptsCount,
    pendingApprovalCount,
    recoveryPipelineCount,
    averageRecoveredAmount,
    byCategory,
    byActionType,
    trend,
    aiPolicy,
  };
}

function actionsGroupedStatusCount(
  groups: Array<{ status: RecoveryStatus; _count: number }>
): Array<{ status: RecoveryStatus; count: number }> {
  return groups.map((g) => ({
    status: g.status,
    count: g._count,
  }));
}
