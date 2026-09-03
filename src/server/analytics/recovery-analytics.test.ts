import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRecoveryAnalytics } from "./recovery-analytics";
import { db } from "@/lib/db";
import {
  RecoveryStatus,
  FailureCategory,
  RecoveryActionType,
} from "@prisma/client";

// Mock db
vi.mock("@/lib/db", () => ({
  db: {
    merchant: {
      findUnique: vi.fn(),
    },
    payment: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    recoveryAction: {
      aggregate: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    recoveryAttempt: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    aiAnalysis: {
      aggregate: vi.fn(),
    },
  },
}));

type MockFn = { mockImplementation: (fn: (...args: unknown[]) => unknown) => void; mockResolvedValue: (val: unknown) => void; mockResolvedValueOnce: (val: unknown) => void };

describe("Recovery Analytics Service (Milestone 7 Step 11A)", () => {
  const merchantId = "merch_demo_123";

  beforeEach(() => {
    vi.clearAllMocks();

    (db.merchant.findUnique as unknown as MockFn).mockResolvedValue({
      currency: "INR",
    });

    (db.payment.aggregate as unknown as MockFn).mockResolvedValue({
      _sum: { amount: 1000000 }, // ₹10,000 in paise
    });

    (db.recoveryAction.aggregate as unknown as MockFn).mockResolvedValue({
      _sum: { expectedRecoveryAmount: 850000 }, // ₹8,500 in paise
    });

    (db.recoveryAttempt.aggregate as unknown as MockFn).mockResolvedValue({
      _sum: { recoveredAmount: 650000 }, // ₹6,500 in paise
    });

    (db.recoveryAttempt.count as unknown as MockFn).mockImplementation(
      (args: unknown) => {
        const query = args as { where?: { status?: RecoveryStatus } } | undefined;
        if (query?.where?.status === RecoveryStatus.EXECUTED) return Promise.resolve(35);
        if (query?.where?.status === RecoveryStatus.FAILED) return Promise.resolve(15);
        return Promise.resolve(50); // total
      }
    );

    (db.recoveryAction.count as unknown as MockFn).mockImplementation(
      (args: unknown) => {
        const query = args as { where?: { status?: { in?: RecoveryStatus[] } } } | undefined;
        if (query?.where?.status?.in?.includes(RecoveryStatus.APPROVED)) return Promise.resolve(25); // pipeline
        return Promise.resolve(12); // pending approval
      }
    );

    (db.aiAnalysis.aggregate as unknown as MockFn).mockResolvedValue({
      _count: 45,
      _avg: {
        confidence: 0.92,
        recoveryProbability: 0.88,
      },
    });

    (db.recoveryAction.groupBy as unknown as MockFn).mockImplementation(
      (args: unknown) => {
        const query = args as { by: string[] };
        if (query.by.includes("status") && query.by.length === 1) {
          return Promise.resolve([
            { status: RecoveryStatus.APPROVED, _count: 10 },
            { status: RecoveryStatus.EXECUTED, _count: 35 },
            { status: RecoveryStatus.PENDING_APPROVAL, _count: 12 },
            { status: RecoveryStatus.REJECTED, _count: 3 },
          ]);
        }
        return Promise.resolve([
          {
            actionType: RecoveryActionType.RETRY_PAYMENT,
            status: RecoveryStatus.EXECUTED,
            _count: 25,
            _sum: { expectedRecoveryAmount: 500000 },
          },
          {
            actionType: RecoveryActionType.SEND_REMINDER,
            status: RecoveryStatus.EXECUTED,
            _count: 10,
            _sum: { expectedRecoveryAmount: 150000 },
          },
        ]);
      }
    );

    (db.recoveryAction.findMany as unknown as MockFn).mockResolvedValue([
      {
        id: "act_1",
        actionType: RecoveryActionType.RETRY_PAYMENT,
        status: RecoveryStatus.EXECUTED,
        expectedRecoveryAmount: 500000,
        createdAt: new Date("2026-08-15T10:00:00Z"),
        payment: {
          id: "pay_1",
          amount: 600000,
          failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
          createdAt: new Date("2026-08-15T09:30:00Z"),
        },
        attempts: [
          {
            id: "att_1",
            status: RecoveryStatus.EXECUTED,
            recoveredAmount: 500000,
            attemptedAt: new Date("2026-08-15T10:05:00Z"),
          },
        ],
      },
      {
        id: "act_2",
        actionType: RecoveryActionType.SEND_REMINDER,
        status: RecoveryStatus.EXECUTED,
        expectedRecoveryAmount: 150000,
        createdAt: new Date("2026-08-16T12:00:00Z"),
        payment: {
          id: "pay_2",
          amount: 400000,
          failureCategory: FailureCategory.INSUFFICIENT_FUNDS,
          createdAt: new Date("2026-08-16T11:45:00Z"),
        },
        attempts: [
          {
            id: "att_2",
            status: RecoveryStatus.EXECUTED,
            recoveredAmount: 150000,
            attemptedAt: new Date("2026-08-16T14:00:00Z"),
          },
        ],
      },
    ]);
  });

  // 1. Merchant isolation
  it("enforces strict merchantId scoping on all aggregation queries", async () => {
    const result = await getRecoveryAnalytics(merchantId);

    expect(result.merchantId).toBe(merchantId);
    expect(db.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ merchantId }),
      })
    );
    expect(db.recoveryAction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          payment: expect.objectContaining({ merchantId }),
        }),
      })
    );
    expect(db.recoveryAttempt.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recoveryAction: expect.objectContaining({
            payment: expect.objectContaining({ merchantId }),
          }),
        }),
      })
    );
  });

  // 2. Correct metrics calculation
  it("calculates top financial KPIs and recovery rates correctly", async () => {
    const result = await getRecoveryAnalytics(merchantId);

    expect(result.revenueAtRisk).toBe(1000000); // in paise (₹10,000)
    expect(result.expectedRecoverable).toBe(850000); // in paise (₹8,500)
    expect(result.recoveredRevenue).toBe(650000); // in paise (₹6,500)
    expect(result.recoveryRate).toBe(65.0); // 650000 / 1000000 * 100
    expect(result.totalRecoveryAttempts).toBe(50);
    expect(result.successfulRecoveries).toBe(35);
    expect(result.failedRecoveries).toBe(15);
    expect(result.pendingApprovalCount).toBe(12);
    expect(result.recoveryPipelineCount).toBe(25);
    expect(result.averageRecoveredAmount).toBe(Math.round(650000 / 35));
    expect(result.isSimulated).toBe(true);
  });

  // 3. Zero denominator safety
  it("handles zero revenue at risk safely without division by zero error", async () => {
    (db.payment.aggregate as unknown as MockFn).mockResolvedValueOnce({
      _sum: { amount: null },
    });
    (db.recoveryAttempt.aggregate as unknown as MockFn).mockResolvedValueOnce({
      _sum: { recoveredAmount: null },
    });

    const result = await getRecoveryAnalytics(merchantId);

    expect(result.revenueAtRisk).toBe(0);
    expect(result.recoveredRevenue).toBe(0);
    expect(result.recoveryRate).toBe(0);
  });

  // 4. Category breakdown calculation
  it("calculates breakdown by failure category with rates", async () => {
    const result = await getRecoveryAnalytics(merchantId);

    expect(result.byCategory.length).toBeGreaterThanOrEqual(2);
    const issuerFailure = result.byCategory.find(
      (c) => c.category === FailureCategory.TEMPORARY_ISSUER_FAILURE
    );
    expect(issuerFailure).toBeDefined();
    expect(issuerFailure?.revenueAtRisk).toBe(600000);
    expect(issuerFailure?.recoveredRevenue).toBe(500000);
    expect(issuerFailure?.recoveryRate).toBeCloseTo(83.3, 1);
  });

  // 5. Action type breakdown calculation
  it("calculates breakdown by action type with success rates", async () => {
    const result = await getRecoveryAnalytics(merchantId);

    expect(result.byActionType.length).toBeGreaterThanOrEqual(1);
    const retryAction = result.byActionType.find(
      (a) => a.actionType === RecoveryActionType.RETRY_PAYMENT
    );
    expect(retryAction).toBeDefined();
    expect(retryAction?.opportunities).toBe(25);
    expect(retryAction?.executed).toBe(25);
    expect(retryAction?.recoveredRevenue).toBe(500000);
  });

  // 6. Date range filtering
  it("applies date range filters when supplied", async () => {
    const startDate = "2026-08-01T00:00:00Z";
    const endDate = "2026-08-31T23:59:59Z";

    await getRecoveryAnalytics(merchantId, { startDate, endDate });

    expect(db.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        }),
      })
    );
  });

  // 7. Empty dataset handling
  it("handles empty database records gracefully", async () => {
    (db.payment.aggregate as unknown as MockFn).mockResolvedValue({
      _sum: { amount: null },
    });
    (db.recoveryAction.aggregate as unknown as MockFn).mockResolvedValue({
      _sum: { expectedRecoveryAmount: null },
    });
    (db.recoveryAttempt.aggregate as unknown as MockFn).mockResolvedValue({
      _sum: { recoveredAmount: null },
    });
    (db.recoveryAttempt.count as unknown as MockFn).mockResolvedValue(0);
    (db.recoveryAction.count as unknown as MockFn).mockResolvedValue(0);
    (db.aiAnalysis.aggregate as unknown as MockFn).mockResolvedValue({
      _count: 0,
      _avg: { confidence: null, recoveryProbability: null },
    });
    (db.recoveryAction.groupBy as unknown as MockFn).mockResolvedValue([]);
    (db.recoveryAction.findMany as unknown as MockFn).mockResolvedValue([]);

    const result = await getRecoveryAnalytics(merchantId);

    expect(result.revenueAtRisk).toBe(0);
    expect(result.expectedRecoverable).toBe(0);
    expect(result.recoveredRevenue).toBe(0);
    expect(result.recoveryRate).toBe(0);
    expect(result.totalRecoveryAttempts).toBe(0);
    expect(result.byCategory).toEqual([]);
    expect(result.byActionType).toEqual([]);
    expect(result.aiPolicy.aiRecommendationsCount).toBe(0);
  });
});
