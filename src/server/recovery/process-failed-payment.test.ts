import { describe, it, expect, vi, beforeEach } from "vitest";
import { processFailedPayment } from "./process-failed-payment";
import { db } from "@/lib/db";
import {
  FailureCategory,
  PaymentMethod,
  PaymentStatus,
  RecoveryActionType,
  RecoveryStatus,
  RiskLevel,
  AuditEventType,
  Payment,
  Customer,
  Merchant,
  PaymentAttempt,
  PaymentFailure,
  AiAnalysis,
  RecoveryAction,
} from "@prisma/client";
import * as claudeModule from "@/server/ai/claude";
import * as geminiModule from "@/server/ai/gemini";
import * as auditService from "@/server/audit/audit-service";

vi.mock("@/lib/db", () => ({
  db: {
    payment: {
      findUnique: vi.fn(),
    },
    aiAnalysis: {
      create: vi.fn(),
    },
    recoveryAction: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    notification: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "notif_mock" }),
    },
  },
}));

vi.mock("@/server/audit/audit-service", () => ({
  createAuditLog: vi.fn(),
}));

vi.mock("@/server/services/auditService", () => ({
  createAuditLog: vi.fn(),
}));

type FullPaymentMock = Payment & {
  customer: Customer;
  merchant: Merchant;
  attempts: PaymentAttempt[];
  failures: PaymentFailure[];
  aiAnalyses: AiAnalysis[];
  recoveryActions: RecoveryAction[];
};

describe("processFailedPayment Orchestration Service", () => {
  const mockMerchant: Merchant = {
    id: "merch_kaveri_01",
    businessName: "Kaveri Textiles Pvt. Ltd.",
    email: "finance@kaveritextiles.com",
    currency: "INR",
    timezone: "Asia/Kolkata",
    autoRecoveryEnabled: true,
    confidenceThreshold: 0.8,
    maxRetryAttempts: 3,
    config: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomer: Customer = {
    id: "cust_001",
    merchantId: "merch_kaveri_01",
    name: "Ravi Shankar",
    email: "ravi.shankar@example.com",
    phone: "+919876543210",
    lifetimeValue: 250000,
    transactionCount: 5,
    successfulPaymentCount: 4,
    failedPaymentCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPayment: FullPaymentMock = {
    id: "pay_test_failed_001",
    merchantId: "merch_kaveri_01",
    customerId: "cust_001",
    providerPaymentId: "pay_rzp_mock_123",
    amount: 500000,
    currency: "INR",
    method: PaymentMethod.CARD,
    status: PaymentStatus.FAILED,
    failureCategory: FailureCategory.TEMPORARY_ISSUER_FAILURE,
    description: "Raw Silk 10m",
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: mockCustomer,
    merchant: mockMerchant,
    attempts: [
      {
        id: "att_001",
        paymentId: "pay_test_failed_001",
        attemptNumber: 1,
        status: PaymentStatus.FAILED,
        providerReference: "pay_rzp_mock_123",
        providerResponseCode: "GATEWAY_TIMEOUT",
        providerResponseMessage: "Bank switch timeout",
        failureReason: "Bank switch timeout",
        attemptedAt: new Date(),
      },
    ],
    failures: [
      {
        id: "fail_001",
        paymentId: "pay_test_failed_001",
        attemptId: "att_001",
        category: FailureCategory.TEMPORARY_ISSUER_FAILURE,
        providerCode: "GATEWAY_TIMEOUT",
        providerDescription: "Bank switch timeout",
        isTransient: true,
        occurredAt: new Date(),
      },
    ],
    aiAnalyses: [],
    recoveryActions: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error if payment is not found in database", async () => {
    vi.mocked(db.payment.findUnique).mockResolvedValueOnce(null);

    const result = await processFailedPayment("non_existent_pay_id");

    expect(result.success).toBe(false);
    expect(result.policyStatus).toBe("PAYMENT_NOT_FOUND");
    expect(db.aiAnalysis.create).not.toHaveBeenCalled();
    expect(db.recoveryAction.create).not.toHaveBeenCalled();
  });

  it("handles idempotency when payment already has an AiAnalysis and RecoveryAction", async () => {
    const existingAnalysis: AiAnalysis = {
      id: "ai_existing_001",
      paymentId: "pay_test_failed_001",
      diagnosis: "Temporary issuer gateway timeout",
      confidence: 0.95,
      recoveryProbability: 0.90,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      riskLevel: RiskLevel.LOW,
      reasoning: "Known transient bank outage",
      modelProvider: "anthropic",
      modelName: "claude-3-5-sonnet",
      rawMetadata: null,
      createdAt: new Date(),
    };

    const existingAction: RecoveryAction = {
      id: "rec_existing_001",
      paymentId: "pay_test_failed_001",
      aiAnalysisId: "ai_existing_001",
      actionType: RecoveryActionType.RETRY_PAYMENT,
      status: RecoveryStatus.RECOMMENDED,
      expectedRecoveryAmount: 450000,
      approvedById: null,
      approvedAt: null,
      executedAt: null,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const paymentWithExistingRecords: FullPaymentMock = {
      ...mockPayment,
      aiAnalyses: [existingAnalysis],
      recoveryActions: [existingAction],
    };

    vi.mocked(db.payment.findUnique).mockResolvedValueOnce(paymentWithExistingRecords as unknown as Payment);

    const result = await processFailedPayment("pay_test_failed_001");

    expect(result.success).toBe(true);
    expect(result.policyStatus).toBe("ALREADY_PROCESSED");
    expect(result.aiAnalysisId).toBe("ai_existing_001");
    expect(result.recoveryActionId).toBe("rec_existing_001");
    // Ensure no duplicate records created
    expect(db.aiAnalysis.create).not.toHaveBeenCalled();
    expect(db.recoveryAction.create).not.toHaveBeenCalled();
    expect(auditService.createAuditLog).not.toHaveBeenCalled();
  });

  it("successfully analyzes with AI, creates AiAnalysis, RecoveryAction and audit logs", async () => {
    vi.mocked(db.payment.findUnique).mockResolvedValueOnce(mockPayment as unknown as Payment);

    vi.spyOn(claudeModule, "isClaudeConfigured").mockReturnValue(true);
    vi.spyOn(claudeModule, "analyzePaymentWithClaude").mockResolvedValueOnce({
      success: true,
      model: "claude-3-5-sonnet",
      data: {
        diagnosis: "Issuer banking switch temporary timeout during peak traffic window.",
        confidence: 0.95,
        recoveryProbability: 0.90,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Customer has 4 successful transactions and failure is transient network timeout.",
      },
    });

    const createdAnalysis: AiAnalysis = {
      id: "ai_created_001",
      paymentId: mockPayment.id,
      diagnosis: "Issuer banking switch temporary timeout.",
      confidence: 0.95,
      recoveryProbability: 0.90,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      riskLevel: RiskLevel.LOW,
      reasoning: "Low risk transient failure.",
      modelProvider: "anthropic",
      modelName: "claude-3-5-sonnet",
      rawMetadata: null,
      createdAt: new Date(),
    };

    const createdAction: RecoveryAction = {
      id: "rec_created_001",
      paymentId: mockPayment.id,
      aiAnalysisId: "ai_created_001",
      actionType: RecoveryActionType.RETRY_PAYMENT,
      status: RecoveryStatus.RECOMMENDED,
      expectedRecoveryAmount: 450000,
      approvedById: null,
      approvedAt: null,
      executedAt: null,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.aiAnalysis.create).mockResolvedValueOnce(createdAnalysis as unknown as AiAnalysis);
    vi.mocked(db.recoveryAction.create).mockResolvedValueOnce(createdAction as unknown as RecoveryAction);

    const result = await processFailedPayment(mockPayment.id, { preferredProvider: "claude" });

    expect(result.success).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.aiProvider).toBe("anthropic");
    expect(result.policyPermittedAction).toBe(RecoveryActionType.RETRY_PAYMENT);
    expect(result.recoveryStatus).toBe(RecoveryStatus.RECOMMENDED);
    expect(result.requiresHumanApproval).toBe(false);

    // Verify DB writes
    expect(db.aiAnalysis.create).toHaveBeenCalledTimes(1);
    expect(db.recoveryAction.create).toHaveBeenCalledTimes(1);
    // Verify AuditLog writes (both AI_DIAGNOSIS_GENERATED and RECOVERY_ACTION_CREATED)
    expect(auditService.createAuditLog).toHaveBeenCalledTimes(2);
    expect(auditService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
      })
    );
    expect(auditService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.RECOVERY_ACTION_CREATED,
      })
    );
  });

  it("uses deterministic fallback when AI provider is unavailable or fails", async () => {
    vi.mocked(db.payment.findUnique).mockResolvedValueOnce(mockPayment as unknown as Payment);

    // Simulate AI unconfigured / failing
    vi.spyOn(claudeModule, "isClaudeConfigured").mockReturnValue(false);
    vi.spyOn(geminiModule, "isGeminiConfigured").mockReturnValue(false);

    const fallbackAnalysis: AiAnalysis = {
      id: "ai_fallback_001",
      paymentId: mockPayment.id,
      diagnosis: "Fallback diagnosis",
      confidence: 0.94,
      recoveryProbability: 0.88,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      riskLevel: RiskLevel.LOW,
      reasoning: "Rule engine evaluation",
      modelProvider: "deterministic_fallback",
      modelName: "deterministic-rule-engine-v1",
      rawMetadata: null,
      createdAt: new Date(),
    };

    const fallbackAction: RecoveryAction = {
      id: "rec_fallback_001",
      paymentId: mockPayment.id,
      aiAnalysisId: "ai_fallback_001",
      actionType: RecoveryActionType.RETRY_PAYMENT,
      status: RecoveryStatus.RECOMMENDED,
      expectedRecoveryAmount: 440000,
      approvedById: null,
      approvedAt: null,
      executedAt: null,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.aiAnalysis.create).mockResolvedValueOnce(fallbackAnalysis as unknown as AiAnalysis);
    vi.mocked(db.recoveryAction.create).mockResolvedValueOnce(fallbackAction as unknown as RecoveryAction);

    const result = await processFailedPayment(mockPayment.id);

    expect(result.success).toBe(true);
    expect(result.isFallback).toBe(true);
    expect(result.aiProvider).toBe("deterministic_fallback");
    expect(result.policyPermittedAction).toBe(RecoveryActionType.RETRY_PAYMENT);

    expect(db.aiAnalysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modelProvider: "deterministic_fallback",
        }),
      })
    );
  });

  it("requires human approval when risk is high or confidence is below threshold", async () => {
    const highRiskPayment: FullPaymentMock = {
      ...mockPayment,
      failureCategory: FailureCategory.INSUFFICIENT_FUNDS,
      failures: [
        {
          id: "fail_002",
          paymentId: mockPayment.id,
          attemptId: "att_001",
          category: FailureCategory.INSUFFICIENT_FUNDS,
          providerCode: "BAD_REQUEST_ERROR",
          providerDescription: "Low balance",
          isTransient: false,
          occurredAt: new Date(),
        },
      ],
    };

    vi.mocked(db.payment.findUnique).mockResolvedValueOnce(highRiskPayment as unknown as Payment);

    vi.spyOn(claudeModule, "isClaudeConfigured").mockReturnValue(true);
    vi.spyOn(claudeModule, "analyzePaymentWithClaude").mockResolvedValueOnce({
      success: true,
      model: "claude-3-5-sonnet",
      data: {
        diagnosis: "Customer bank balance was insufficient.",
        confidence: 0.65, // Below merchant threshold of 0.8
        recoveryProbability: 0.40,
        recommendedAction: "SEND_REMINDER",
        riskLevel: "HIGH",
        reasoning: "High risk due to repeat balance failures.",
      },
    });

    const highRiskAnalysis: AiAnalysis = {
      id: "ai_high_risk_001",
      paymentId: highRiskPayment.id,
      diagnosis: "Customer bank balance was insufficient.",
      confidence: 0.65,
      recoveryProbability: 0.40,
      recommendedAction: RecoveryActionType.SEND_REMINDER,
      riskLevel: RiskLevel.HIGH,
      reasoning: "High risk due to repeat balance failures.",
      modelProvider: "anthropic",
      modelName: "claude-3-5-sonnet",
      rawMetadata: null,
      createdAt: new Date(),
    };

    const highRiskAction: RecoveryAction = {
      id: "rec_approval_001",
      paymentId: highRiskPayment.id,
      aiAnalysisId: "ai_high_risk_001",
      actionType: RecoveryActionType.SEND_REMINDER,
      status: RecoveryStatus.PENDING_APPROVAL,
      expectedRecoveryAmount: 200000,
      approvedById: null,
      approvedAt: null,
      executedAt: null,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.aiAnalysis.create).mockResolvedValueOnce(highRiskAnalysis as unknown as AiAnalysis);
    vi.mocked(db.recoveryAction.create).mockResolvedValueOnce(highRiskAction as unknown as RecoveryAction);

    const result = await processFailedPayment(highRiskPayment.id);

    expect(result.success).toBe(true);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.recoveryStatus).toBe(RecoveryStatus.PENDING_APPROVAL);
  });

  it("overrides and escalates when AI recommendation conflicts with deterministic policy", async () => {
    // Insufficient funds allows only SEND_REMINDER / ESCALATE, never RETRY_PAYMENT
    const insufficientFundsPayment: FullPaymentMock = {
      ...mockPayment,
      failureCategory: FailureCategory.INSUFFICIENT_FUNDS,
      failures: [
        {
          id: "fail_003",
          paymentId: mockPayment.id,
          attemptId: "att_001",
          category: FailureCategory.INSUFFICIENT_FUNDS,
          providerCode: "BAD_REQUEST_ERROR",
          providerDescription: "Insufficient funds in bank account",
          isTransient: false,
          occurredAt: new Date(),
        },
      ],
    };

    vi.mocked(db.payment.findUnique).mockResolvedValueOnce(insufficientFundsPayment as unknown as Payment);

    vi.spyOn(claudeModule, "isClaudeConfigured").mockReturnValue(true);
    // Rogue AI hallucinates and recommends immediate RETRY_PAYMENT for an insufficient funds failure
    vi.spyOn(claudeModule, "analyzePaymentWithClaude").mockResolvedValueOnce({
      success: true,
      model: "claude-3-5-sonnet",
      data: {
        diagnosis: "Customer will probably have funds now.",
        confidence: 0.95,
        recoveryProbability: 0.90,
        recommendedAction: "RETRY_PAYMENT", // Disallowed for INSUFFICIENT_FUNDS!
        riskLevel: "LOW",
        reasoning: "Retry immediately.",
      },
    });

    const conflictAnalysis: AiAnalysis = {
      id: "ai_conflict_001",
      paymentId: insufficientFundsPayment.id,
      diagnosis: "AI hallucination",
      confidence: 0.95,
      recoveryProbability: 0.90,
      recommendedAction: RecoveryActionType.RETRY_PAYMENT,
      riskLevel: RiskLevel.LOW,
      reasoning: "Retry immediately",
      modelProvider: "anthropic",
      modelName: "claude-3-5-sonnet",
      rawMetadata: null,
      createdAt: new Date(),
    };

    const conflictAction: RecoveryAction = {
      id: "rec_rejected_001",
      paymentId: insufficientFundsPayment.id,
      aiAnalysisId: "ai_conflict_001",
      actionType: RecoveryActionType.SEND_REMINDER,
      status: RecoveryStatus.REJECTED,
      expectedRecoveryAmount: 450000,
      approvedById: null,
      approvedAt: null,
      executedAt: null,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.aiAnalysis.create).mockResolvedValueOnce(conflictAnalysis as unknown as AiAnalysis);
    vi.mocked(db.recoveryAction.create).mockResolvedValueOnce(conflictAction as unknown as RecoveryAction);

    const result = await processFailedPayment(insufficientFundsPayment.id);

    expect(result.success).toBe(true);
    // The deterministic policy must REJECT the illegal AI recommendation and substitute the safe policy default (SEND_REMINDER)
    expect(result.policyStatus).toBe("AI_RECOMMENDATION_REJECTED");
    expect(result.policyPermittedAction).toBe(RecoveryActionType.SEND_REMINDER);
    expect(result.recoveryStatus).toBe(RecoveryStatus.REJECTED);
  });
});
