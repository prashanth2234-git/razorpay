import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import * as authModule from "@/server/auth";
import * as claudeModule from "@/server/ai/claude";
import { db } from "@/lib/db";
import { UserRole, PaymentStatus, PaymentMethod, FailureCategory, RiskLevel, RecoveryActionType, AuditEventType, ActorType, AiAnalysis, AuditLog } from "@prisma/client";

vi.mock("@/server/auth");
vi.mock("@/server/ai/claude");
vi.mock("@/lib/db", () => ({
  db: {
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    aiAnalysis: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    recoveryAction: {
      create: vi.fn(),
    },
    recoveryAttempt: {
      create: vi.fn(),
    },
  },
}));

type DbFindFirstPaymentResult = Awaited<ReturnType<typeof db.payment.findFirst>>;

describe("POST /api/payments/[id]/ai-analyze (Milestone 5 Step 7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/payments/pay_123/ai-analyze", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "pay_123" }) });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(db.aiAnalysis.create).not.toHaveBeenCalled();
  });

  it("rejects payment belonging to another merchant with 404 (merchant isolation)", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue({
      id: "usr_01",
      email: "farhan@kaveritextiles.com",
      role: UserRole.OPERATOR,
      merchantId: "merch_kaveri_demo_01",
      merchantName: "Kaveri Textiles",
    });

    // Mock payment not found for this merchantId
    vi.mocked(db.payment.findFirst).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/payments/pay_other_merchant/ai-analyze", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "pay_other_merchant" }) });
    expect(res.status).toBe(404);

    expect(db.payment.findFirst).toHaveBeenCalledWith({
      where: {
        id: "pay_other_merchant",
        merchantId: "merch_kaveri_demo_01",
      },
      include: expect.any(Object),
    });
    expect(claudeModule.analyzePaymentWithClaude).not.toHaveBeenCalled();
  });

  it("handles valid failed payment, persists AiAnalysis, and creates AuditLog without altering payment status", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue({
      id: "usr_01",
      email: "farhan@kaveritextiles.com",
      role: UserRole.OPERATOR,
      merchantId: "merch_kaveri_demo_01",
      merchantName: "Kaveri Textiles",
    });

    const mockPayment = {
      id: "pay_123",
      merchantId: "merch_kaveri_demo_01",
      customerId: "cust_01",
      providerPaymentId: "pay_rzp_mock_123",
      amount: 499900,
      currency: "INR",
      method: PaymentMethod.UPI,
      status: PaymentStatus.FAILED,
      failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
      description: "Organic Linen Shirt",
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      customer: {
        id: "cust_01",
        merchantId: "merch_kaveri_demo_01",
        name: "Devendra Verma",
        email: "devendra@gmail.com",
        phone: "+91 9876543210",
        lifetimeValue: 1850000,
        transactionCount: 5,
        successfulPaymentCount: 4,
        failedPaymentCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      failures: [
        {
          id: "fail_01",
          paymentId: "pay_123",
          attemptId: null,
          category: FailureCategory.TEMPORARY_ISSUER_FAILURE,
          providerCode: "BAD_REQUEST_GATEWAY_TIMEOUT",
          providerDescription: "Bank gateway dropped connection",
          isTransient: true,
          occurredAt: new Date(),
        },
      ],
      attempts: [
        {
          id: "att_01",
          paymentId: "pay_123",
          attemptNumber: 1,
          status: "FAILED",
          providerPaymentId: null,
          providerResponseCode: "504",
          providerResponseMessage: "Gateway timeout",
          attemptedAt: new Date(),
        },
      ],
      merchant: {
        autoRecoveryEnabled: true,
        confidenceThreshold: 0.8,
      },
    };

    vi.mocked(db.payment.findFirst).mockResolvedValue(mockPayment as unknown as DbFindFirstPaymentResult);

    vi.mocked(claudeModule.analyzePaymentWithClaude).mockResolvedValue({
      success: true,
      model: "claude-3-7-sonnet-20250219",
      data: {
        diagnosis: "Temporary banking gateway timeout.",
        confidence: 0.94,
        recoveryProbability: 0.88,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Customer has 4 successful transactions and the failure is transient.",
      },
    });

    const mockCreatedAnalysis: AiAnalysis = {
      id: "ai_analysis_01",
      paymentId: "pay_123",
      diagnosis: "Temporary banking gateway timeout.",
      confidence: 0.94,
      recoveryProbability: 0.88,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      riskLevel: RiskLevel.LOW,
      reasoning: "Customer has 4 successful transactions and the failure is transient.",
      modelProvider: "anthropic",
      modelName: "claude-3-7-sonnet-20250219",
      rawMetadata: { source: "claude_live" },
      createdAt: new Date(),
    };

    vi.mocked(db.aiAnalysis.create).mockResolvedValue(mockCreatedAnalysis);

    const mockCreatedAuditLog: AuditLog = {
      id: "audit_01",
      merchantId: "merch_kaveri_demo_01",
      userId: "usr_01",
      paymentId: "pay_123",
      recoveryActionId: null,
      actorType: ActorType.SYSTEM,
      eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
      description: "Claude AI generated diagnosis",
      metadata: null,
      createdAt: new Date(),
    };

    vi.mocked(db.auditLog.create).mockResolvedValue(mockCreatedAuditLog);

    const req = new NextRequest("http://localhost:3000/api/payments/pay_123/ai-analyze", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "pay_123" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.source).toBe("claude");
    expect(body.analysis.recommendedAction).toBe("RETRY_PAYMENT");
    expect(body.analysis.confidence).toBe(0.94);

    // Verify database persistence
    expect(db.aiAnalysis.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: "pay_123",
        diagnosis: "Temporary banking gateway timeout.",
        confidence: 0.94,
        recoveryProbability: 0.88,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        modelProvider: "anthropic",
      }),
    });

    // Verify audit log creation
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: "merch_kaveri_demo_01",
        userId: "usr_01",
        paymentId: "pay_123",
        eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
        actorType: ActorType.SYSTEM,
      }),
    });

    // Verify safety: Payment status is NOT changed, and recovery is NOT executed
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(db.recoveryAction.create).not.toHaveBeenCalled();
    expect(db.recoveryAttempt.create).not.toHaveBeenCalled();
  });

  it("handles controlled Claude API failure gracefully without crashing or fabricating results", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue({
      id: "usr_01",
      email: "farhan@kaveritextiles.com",
      role: UserRole.OPERATOR,
      merchantId: "merch_kaveri_demo_01",
      merchantName: "Kaveri Textiles",
    });

    const mockPayment = {
      id: "pay_123",
      merchantId: "merch_kaveri_demo_01",
      customerId: "cust_01",
      providerPaymentId: null,
      amount: 100000,
      currency: "INR",
      method: PaymentMethod.CARD,
      status: PaymentStatus.FAILED,
      failureCategory: FailureCategory.EXPIRED_CARD,
      description: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      customer: {
        id: "cust_01",
        merchantId: "merch_kaveri_demo_01",
        name: "Aarav",
        email: "aarav@test.com",
        phone: null,
        lifetimeValue: 0,
        transactionCount: 1,
        successfulPaymentCount: 0,
        failedPaymentCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      failures: [],
      attempts: [],
      merchant: { autoRecoveryEnabled: true, confidenceThreshold: 0.8 },
    };

    vi.mocked(db.payment.findFirst).mockResolvedValue(mockPayment as unknown as DbFindFirstPaymentResult);

    vi.mocked(claudeModule.analyzePaymentWithClaude).mockResolvedValue({
      success: false,
      code: "API_ERROR",
      error: "Anthropic rate limit exceeded.",
      model: "claude-3-7-sonnet-20250219",
    });

    const req = new NextRequest("http://localhost:3000/api/payments/pay_123/ai-analyze", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "pay_123" }) });
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("API_ERROR");
    expect(body.error).toBe("Anthropic rate limit exceeded.");

    // Does NOT persist false records or change status
    expect(db.aiAnalysis.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(db.payment.update).not.toHaveBeenCalled();
  });

  it("never returns CLAUDE_API_KEY in error response", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue({
      id: "usr_01",
      email: "farhan@kaveritextiles.com",
      role: UserRole.OPERATOR,
      merchantId: "merch_kaveri_demo_01",
      merchantName: "Kaveri Textiles",
    });

    const mockPayment = {
      id: "pay_123",
      merchantId: "merch_kaveri_demo_01",
      customerId: "cust_01",
      providerPaymentId: null,
      amount: 100000,
      currency: "INR",
      method: PaymentMethod.CARD,
      status: PaymentStatus.FAILED,
      failureCategory: FailureCategory.EXPIRED_CARD,
      description: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      customer: {
        id: "cust_01",
        merchantId: "merch_kaveri_demo_01",
        name: "Aarav",
        email: "aarav@test.com",
        phone: null,
        lifetimeValue: 0,
        transactionCount: 1,
        successfulPaymentCount: 0,
        failedPaymentCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      failures: [],
      attempts: [],
      merchant: { autoRecoveryEnabled: true, confidenceThreshold: 0.8 },
    };

    vi.mocked(db.payment.findFirst).mockResolvedValue(mockPayment as unknown as DbFindFirstPaymentResult);

    vi.mocked(claudeModule.analyzePaymentWithClaude).mockResolvedValue({
      success: false,
      code: "MISSING_API_KEY",
      error: "Claude API key is not configured in environment (CLAUDE_API_KEY).",
      model: "claude-3-7-sonnet-20250219",
    });

    const req = new NextRequest("http://localhost:3000/api/payments/pay_123/ai-analyze", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "pay_123" }) });
    const text = await res.text();

    expect(text).not.toContain("sk-ant-");
  });
});
