import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import * as authModule from "@/server/auth";
import { db } from "@/lib/db";
import {
  UserRole,
  PaymentStatus,
  PaymentMethod,
  FailureCategory,
  RecoveryStatus,
  RecoveryActionType,
  RiskLevel,
} from "@prisma/client";

vi.mock("@/server/auth");
vi.mock("@/lib/db", () => ({
  db: {
    recoveryAction: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      update: vi.fn(),
    },
    recoveryAttempt: {
      create: vi.fn(),
    },
  },
}));

type DbFindFirstRecoveryActionResult = Awaited<ReturnType<typeof db.recoveryAction.findFirst>>;

describe("POST /api/recovery/[id]/evaluate (Milestone 5 Step 8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/recovery/act_123/evaluate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "act_123" }) });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects cross-merchant recovery action with 404", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue({
      id: "usr_01",
      email: "farhan@kaveritextiles.com",
      role: UserRole.OPERATOR,
      merchantId: "merch_kaveri_demo_01",
      merchantName: "Kaveri Textiles",
    });

    vi.mocked(db.recoveryAction.findFirst).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/recovery/act_foreign/evaluate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "act_foreign" }) });
    expect(res.status).toBe(404);

    expect(db.recoveryAction.findFirst).toHaveBeenCalledWith({
      where: {
        id: "act_foreign",
        payment: { merchantId: "merch_kaveri_demo_01" },
      },
      include: expect.any(Object),
    });
  });

  it("evaluates AI recommendation against policy without mutating payment status or executing recovery", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue({
      id: "usr_01",
      email: "farhan@kaveritextiles.com",
      role: UserRole.OPERATOR,
      merchantId: "merch_kaveri_demo_01",
      merchantName: "Kaveri Textiles",
    });

    const mockAction = {
      id: "act_123",
      paymentId: "pay_123",
      actionType: RecoveryActionType.RETRY_PAYMENT,
      status: RecoveryStatus.PENDING_APPROVAL,
      expectedRecoveryAmount: 499900,
      payment: {
        id: "pay_123",
        merchantId: "merch_kaveri_demo_01",
        amount: 499900,
        currency: "INR",
        status: PaymentStatus.FAILED,
        method: PaymentMethod.UPI,
        failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
        failures: [
          {
            category: FailureCategory.TEMPORARY_ISSUER_FAILURE,
            occurredAt: new Date(),
          },
        ],
        attempts: [
          {
            attemptNumber: 1,
            status: "FAILED",
          },
        ],
        merchant: {
          autoRecoveryEnabled: true,
          confidenceThreshold: 0.80,
          maxRetryAttempts: 3,
        },
      },
      aiAnalysis: {
        diagnosis: "Temporary banking gateway timeout.",
        confidence: 0.94,
        recoveryProbability: 0.88,
        recommendedAction: RecoveryActionType.RETRY_PAYMENT,
        riskLevel: RiskLevel.LOW,
        reasoning: "Transient failure with strong recovery odds.",
      },
    };

    vi.mocked(db.recoveryAction.findFirst).mockResolvedValue(
      mockAction as unknown as DbFindFirstRecoveryActionResult
    );

    const req = new NextRequest("http://localhost:3000/api/recovery/act_123/evaluate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "act_123" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.decision.status).toBe("AI_RECOMMENDATION_ACCEPTED");
    expect(body.decision.policyPermittedAction).toBe("RETRY_PAYMENT");
    expect(body.decision.requiresHumanApproval).toBe(false);

    // CRITICAL SAFETY INVARIANTS: NO MUTATIONS
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(db.recoveryAction.update).not.toHaveBeenCalled();
    expect(db.recoveryAttempt.create).not.toHaveBeenCalled();
  });
});
