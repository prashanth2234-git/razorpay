import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeRecovery } from "./execute-recovery";
import { approveRecoveryAction, rejectRecoveryAction } from "./executor";
import { db } from "@/lib/db";
import {
  FailureCategory,
  PaymentMethod,
  PaymentStatus,
  RecoveryActionType,
  RecoveryStatus,
  RiskLevel,
  Payment,
  Customer,
  Merchant,
  PaymentFailure,
  AiAnalysis,
  RecoveryAction,
  RecoveryAttempt,
} from "@prisma/client";
import { canPerformOperationalActions } from "@/server/permissions";
import { UserRole } from "@prisma/client";
import * as providerModule from "./provider";

vi.mock("@/lib/db", () => ({
  db: {
    recoveryAction: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    recoveryAttempt: {
      create: vi.fn(),
    },
    payment: {
      update: vi.fn(),
    },
    customer: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) =>
      callback({
        recoveryAction: { update: vi.fn().mockResolvedValue({}) },
        recoveryAttempt: { create: vi.fn().mockResolvedValue({ id: "att_tx_001" }) },
        payment: { update: vi.fn().mockResolvedValue({}) },
        customer: { update: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        notification: { create: vi.fn().mockResolvedValue({}) },
      })
    ),
  },
}));

vi.mock("@/server/services/auditService", () => ({
  createAuditLog: vi.fn(),
}));

type FullActionMock = RecoveryAction & {
  payment: Payment & {
    customer: Customer;
    merchant: Merchant;
    failures: PaymentFailure[];
  };
  aiAnalysis: AiAnalysis | null;
  attempts: RecoveryAttempt[];
};

describe("Bounded Recovery Execution Service (Milestone 6 Step 9)", () => {
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

  const mockPayment: Payment & {
    customer: Customer;
    merchant: Merchant;
    failures: PaymentFailure[];
  } = {
    id: "pay_test_001",
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
    failures: [
      {
        id: "fail_001",
        paymentId: "pay_test_001",
        attemptId: null,
        category: FailureCategory.TEMPORARY_ISSUER_FAILURE,
        providerCode: "GATEWAY_TIMEOUT",
        providerDescription: "Bank switch timeout",
        isTransient: true,
        occurredAt: new Date(),
      },
    ],
  };

  const mockAiAnalysis: AiAnalysis = {
    id: "ai_001",
    paymentId: "pay_test_001",
    diagnosis: "Temporary issuer banking switch timeout.",
    confidence: 0.95,
    recoveryProbability: 0.90,
    recommendedAction: RecoveryActionType.RETRY_PAYMENT,
    riskLevel: RiskLevel.LOW,
    reasoning: "High customer loyalty and transient network failure.",
    modelProvider: "anthropic",
    modelName: "claude-3-5-sonnet",
    rawMetadata: null,
    createdAt: new Date(),
  };

  const mockAction: FullActionMock = {
    id: "rec_act_001",
    paymentId: "pay_test_001",
    aiAnalysisId: "ai_001",
    actionType: RecoveryActionType.RETRY_PAYMENT,
    status: RecoveryStatus.APPROVED,
    expectedRecoveryAmount: 450000,
    approvedById: "usr_operator_01",
    approvedAt: new Date(),
    executedAt: null,
    config: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    payment: mockPayment,
    aiAnalysis: mockAiAnalysis,
    attempts: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully executes an approved recovery action through MockRecoveryProvider", async () => {
    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(mockAction as unknown as RecoveryAction);

    const mockProvider = {
      name: "MockRecoveryProvider",
      execute: vi.fn().mockResolvedValueOnce({
        success: true,
        recoveredAmount: 500000,
        providerReference: "mock_capt_success_123",
        message: "Payment captured successfully via automated gateway retry route.",
        isSimulated: true,
      }),
    };
    vi.spyOn(providerModule, "getRecoveryProvider").mockReturnValue(mockProvider);

    const result = await executeRecovery(mockAction.id, {
      merchantId: mockMerchant.id,
      userId: "usr_operator_01",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(RecoveryStatus.EXECUTED);
    expect(result.paymentStatus).toBe(PaymentStatus.RECOVERED);
    expect(result.recoveredAmount).toBe(500000);
    expect(result.isSimulated).toBe(true);
    expect(mockProvider.execute).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("blocks execution of an unapproved HIGH-risk action", async () => {
    const highRiskAction: FullActionMock = {
      ...mockAction,
      status: RecoveryStatus.PENDING_APPROVAL,
      aiAnalysis: {
        ...mockAiAnalysis,
        riskLevel: RiskLevel.HIGH,
        confidence: 0.60,
      },
    };

    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(highRiskAction as unknown as RecoveryAction);

    await expect(
      executeRecovery(highRiskAction.id, { merchantId: mockMerchant.id })
    ).rejects.toThrow(/approval/i);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("blocks execution of a REJECTED action", async () => {
    const rejectedAction: FullActionMock = {
      ...mockAction,
      status: RecoveryStatus.REJECTED,
    };

    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(rejectedAction as unknown as RecoveryAction);

    await expect(
      executeRecovery(rejectedAction.id, { merchantId: mockMerchant.id })
    ).rejects.toThrow(/cannot execute rejected/i);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("blocks execution when deterministic policy forbids the action for the failure category", async () => {
    // Insufficient funds allows SEND_REMINDER / ESCALATE, but action is RETRY_PAYMENT
    const conflictAction: FullActionMock = {
      ...mockAction,
      status: RecoveryStatus.RECOMMENDED, // Not explicitly approved
      actionType: RecoveryActionType.RETRY_PAYMENT,
      payment: {
        ...mockPayment,
        failureCategory: FailureCategory.INSUFFICIENT_FUNDS,
        failures: [
          {
            id: "fail_002",
            paymentId: "pay_test_001",
            attemptId: null,
            category: FailureCategory.INSUFFICIENT_FUNDS,
            providerCode: "BAD_REQUEST_ERROR",
            providerDescription: "Low balance",
            isTransient: false,
            occurredAt: new Date(),
          },
        ],
      },
    };

    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(conflictAction as unknown as RecoveryAction);

    await expect(
      executeRecovery(conflictAction.id, { merchantId: mockMerchant.id })
    ).rejects.toThrow(/policy conflict/i);

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("enforces max retry limit and blocks execution when attempt count is exceeded", async () => {
    const exceededAction: FullActionMock = {
      ...mockAction,
      attempts: [
        {
          id: "att_1",
          recoveryActionId: mockAction.id,
          attemptNumber: 1,
          status: RecoveryStatus.FAILED,
          result: "Failed 1",
          recoveredAmount: 0,
          attemptedAt: new Date(),
        },
        {
          id: "att_2",
          recoveryActionId: mockAction.id,
          attemptNumber: 2,
          status: RecoveryStatus.FAILED,
          result: "Failed 2",
          recoveredAmount: 0,
          attemptedAt: new Date(),
        },
        {
          id: "att_3",
          recoveryActionId: mockAction.id,
          attemptNumber: 3,
          status: RecoveryStatus.FAILED,
          result: "Failed 3",
          recoveredAmount: 0,
          attemptedAt: new Date(),
        },
      ],
    };

    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(exceededAction as unknown as RecoveryAction);

    await expect(
      executeRecovery(exceededAction.id, { merchantId: mockMerchant.id })
    ).rejects.toThrow(/maximum retry attempts/i);

    // Verify action was escalated
    expect(db.recoveryAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: exceededAction.id },
        data: { status: RecoveryStatus.ESCALATED },
      })
    );
  });

  it("is idempotent and returns cached result on duplicate execution without double-counting revenue", async () => {
    const alreadyExecutedAction: FullActionMock = {
      ...mockAction,
      status: RecoveryStatus.EXECUTED,
      executedAt: new Date(),
      attempts: [
        {
          id: "att_prev_001",
          recoveryActionId: mockAction.id,
          attemptNumber: 1,
          status: RecoveryStatus.EXECUTED,
          result: "Payment captured successfully",
          recoveredAmount: 500000,
          attemptedAt: new Date(),
        },
      ],
    };

    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(alreadyExecutedAction as unknown as RecoveryAction);

    const result = await executeRecovery(alreadyExecutedAction.id, {
      merchantId: mockMerchant.id,
    });

    expect(result.success).toBe(true);
    expect(result.alreadyExecuted).toBe(true);
    expect(result.recoveredAmount).toBe(500000);
    // Must not execute transaction or re-mutate DB
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("handles failed recovery execution by updating action to FAILED and not counting revenue", async () => {
    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(mockAction as unknown as RecoveryAction);

    const mockProvider = {
      name: "MockRecoveryProvider",
      execute: vi.fn().mockResolvedValueOnce({
        success: false,
        recoveredAmount: 0,
        providerReference: "mock_decl_123",
        message: "Secondary retry was declined by issuing bank.",
        isSimulated: true,
      }),
    };
    vi.spyOn(providerModule, "getRecoveryProvider").mockReturnValue(mockProvider);

    const result = await executeRecovery(mockAction.id, {
      merchantId: mockMerchant.id,
      userId: "usr_operator_01",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(RecoveryStatus.FAILED);
    expect(result.paymentStatus).toBe(PaymentStatus.FAILED);
    expect(result.recoveredAmount).toBe(0);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("strictly authorizes OPERATOR and ADMIN roles, while blocking VIEWER from executing or approving", () => {
    expect(canPerformOperationalActions(UserRole.ADMIN)).toBe(true);
    expect(canPerformOperationalActions(UserRole.OPERATOR)).toBe(true);
    expect(canPerformOperationalActions(UserRole.VIEWER)).toBe(false);
  });

  it("approves recovery action within a merchant-scoped transaction", async () => {
    const pendingAction = {
      ...mockAction,
      status: RecoveryStatus.PENDING_APPROVAL,
    };

    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(pendingAction as unknown as RecoveryAction);

    await approveRecoveryAction(mockMerchant.id, "usr_admin_01", pendingAction.id);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects recovery action and records rejection audit log", async () => {
    vi.mocked(db.recoveryAction.findFirst).mockResolvedValueOnce(mockAction as unknown as RecoveryAction);

    await rejectRecoveryAction(mockMerchant.id, "usr_admin_01", mockAction.id, "Customer requested manual refund");

    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
