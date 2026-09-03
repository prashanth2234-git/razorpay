import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { RecoveryClient, RecoveryActionItem } from "./recovery-client";
import { RecoveryActionType, RecoveryStatus, UserRole } from "@/types/client";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("Recovery Dashboard UI Component (Milestone 6 Step 10B Hardened)", () => {
  const mockActions: RecoveryActionItem[] = [
    {
      id: "rec_001",
      actionType: RecoveryActionType.RETRY_PAYMENT,
      status: RecoveryStatus.PENDING_APPROVAL,
      expectedRecoveryAmount: 450000,
      createdAt: new Date().toISOString(),
      approvedAt: null,
      executedAt: null,
      payment: {
        id: "pay_001",
        providerPaymentId: "pay_rzp_mock_111",
        amount: 500000,
        currency: "INR",
        failureCategory: "TEMPORARY_ISSUER_FAILURE",
        customer: {
          id: "cust_001",
          name: "Ravi Shankar",
          email: "ravi.shankar@example.com",
          phone: "+919876543210",
        },
        failures: [
          {
            id: "fail_001",
            category: "TEMPORARY_ISSUER_FAILURE",
            providerCode: "GATEWAY_TIMEOUT",
            providerDescription: "Bank switch timeout during peak traffic",
            isTransient: true,
            occurredAt: new Date().toISOString(),
          },
        ],
      },
      aiAnalysis: {
        id: "ai_001",
        diagnosis: "Temporary issuer banking switch timeout.",
        confidence: 0.95,
        recoveryProbability: 0.90,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Transient failure during bank maintenance window.",
      },
      attempts: [],
    },
    {
      id: "rec_002",
      actionType: RecoveryActionType.SEND_REMINDER,
      status: RecoveryStatus.APPROVED,
      expectedRecoveryAmount: 200000,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      executedAt: null,
      payment: {
        id: "pay_002",
        providerPaymentId: "pay_rzp_mock_222",
        amount: 300000,
        currency: "INR",
        failureCategory: "INSUFFICIENT_FUNDS",
        customer: {
          id: "cust_002",
          name: "Priya Sharma",
          email: "priya.sharma@example.com",
          phone: null,
        },
      },
      aiAnalysis: {
        id: "ai_002",
        diagnosis: "Customer account balance low.",
        confidence: 0.88,
        recoveryProbability: 0.65,
        recommendedAction: "SEND_REMINDER",
        riskLevel: "MEDIUM",
        reasoning: "Smart payment link provides top-up window.",
      },
      attempts: [],
    },
    {
      id: "rec_003",
      actionType: RecoveryActionType.RETRY_PAYMENT,
      status: RecoveryStatus.EXECUTED,
      expectedRecoveryAmount: 750000,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      executedAt: new Date().toISOString(),
      payment: {
        id: "pay_003",
        providerPaymentId: "pay_rzp_mock_333",
        amount: 750000,
        currency: "INR",
        failureCategory: "NETWORK_TIMEOUT",
        customer: {
          id: "cust_003",
          name: "Amit Patel",
          email: "amit.patel@example.com",
          phone: "+919811223344",
        },
      },
      aiAnalysis: {
        id: "ai_003",
        diagnosis: "Gateway timeout.",
        confidence: 0.98,
        recoveryProbability: 0.95,
        recommendedAction: "RETRY_PAYMENT",
        riskLevel: "LOW",
        reasoning: "Immediate network retry safe.",
      },
      attempts: [
        {
          id: "att_001",
          attemptNumber: 1,
          status: "EXECUTED",
          result: "Payment captured successfully",
          recoveredAmount: 750000,
          attemptedAt: new Date().toISOString(),
        },
      ],
    },
  ];

  const mockSummary = {
    totalActions: 3,
    executed: 1,
    pendingApproval: 1,
    failed: 0,
    totalRecoveredAmount: 750000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/approve")) {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }
      if (url.includes("/execute")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            recoveredAmount: 300000,
            providerReference: "mock_capt_12345",
            message: "Payment captured successfully",
            isSimulated: true,
          }),
        } as Response;
      }
      if (url.includes("/reject")) {
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }
      if (url.includes("/evaluate")) {
        return {
          ok: true,
          json: async () => ({
            decision: {
              status: "AI_RECOMMENDATION_REQUIRES_APPROVAL",
              aiRecommendedAction: "RETRY_PAYMENT",
              policyPermittedAction: "RETRY_PAYMENT",
              aiConfidence: 0.95,
              aiRecoveryProbability: 0.90,
              aiRiskLevel: "LOW",
              requiresHumanApproval: true,
              isPolicyOverridden: false,
              policyReason: "Automated retry requires operator approval.",
              policyFlags: [],
            },
          }),
        } as Response;
      }
      if (url.includes("/api/recovery/rec_")) {
        return {
          ok: true,
          json: async () => mockActions[0],
        } as Response;
      }
      // Default /api/recovery list endpoint
      return {
        ok: true,
        json: async () => ({ recoveryActions: mockActions, summary: mockSummary }),
      } as Response;
    });
  });

  // 1. Opening a recovery item
  it("opens recovery detail drawer when a row is clicked", async () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    const row = screen.getByText("Ravi Shankar");
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText("Recovery Opportunity")).toBeDefined();
    });
  });

  // 2. Displaying AI diagnosis with Advisory Only tag
  it("displays AI diagnosis with 'AI Recommendation — Advisory Only' header", async () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    fireEvent.click(screen.getByText("Ravi Shankar"));

    await waitFor(() => {
      expect(screen.getByText("AI Recommendation — Advisory Only")).toBeDefined();
      expect(screen.getAllByText("Advisory Only").length).toBeGreaterThanOrEqual(1);
    });
  });

  // 3. Displaying deterministic policy decision with Authoritative tag
  it("displays deterministic policy decision with 'Deterministic Policy Gate — Authoritative' header", async () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    fireEvent.click(screen.getByText("Ravi Shankar"));

    await waitFor(() => {
      expect(screen.getByText("Deterministic Policy Gate — Authoritative")).toBeDefined();
      expect(screen.getByText("Policy: Approval Required")).toBeDefined();
    });
  });

  // 4. Operator can approve
  it("allows operator to approve pending recovery action", async () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    const approveButton = screen.getAllByRole("button", { name: /^approve$/i })[0];
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/recovery/rec_001/approve"),
        expect.objectContaining({ method: "POST" })
      );
      expect(screen.getByText(/action approved by operator/i)).toBeDefined();
    });
  });

  // 5. Viewer cannot approve
  it("prevents viewer role from approving or executing recovery actions", () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.VIEWER}
      />
    );

    expect(screen.getByText(/viewer mode \(read-only\)/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^execute$/i })).toBeNull();
  });

  // 6. Approved action shows Execute
  it("displays Execute button for approved recovery action", () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    const executeButtons = screen.getAllByRole("button", { name: /^execute$/i });
    expect(executeButtons.length).toBeGreaterThanOrEqual(1);
  });

  // 7. Execute calls the existing API
  it("calls POST /api/recovery/:id/execute when Execute is clicked", async () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    const executeButton = screen.getAllByRole("button", { name: /^execute$/i })[0];
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/recovery/rec_002/execute"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  // 8. Successful execution displays recovered amount
  it("displays recovered amount on successful execution", async () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    const executeButton = screen.getAllByRole("button", { name: /^execute$/i })[0];
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(screen.getByText(/recovery successful! recovered ₹3,000/i)).toBeDefined();
    });
  });

  // 9. Failed execution displays an error
  it("displays error feedback when execution fails or is declined by provider", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/execute")) {
        return {
          ok: true,
          json: async () => ({
            success: false,
            message: "Secondary retry was declined by issuing bank.",
            error: "Secondary retry was declined by issuing bank.",
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ recoveryActions: mockActions, summary: mockSummary }),
      } as Response;
    });

    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    const executeButton = screen.getAllByRole("button", { name: /^execute$/i })[0];
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(screen.getByText(/recovery attempt was declined/i)).toBeDefined();
    });
  });

  // 10. Rejected action cannot execute
  it("prevents execution of rejected action", async () => {
    const rejectedActions: RecoveryActionItem[] = [
      {
        ...mockActions[0],
        status: RecoveryStatus.REJECTED,
      },
    ];

    render(
      <RecoveryClient
        initialActions={rejectedActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    expect(screen.queryByRole("button", { name: /^execute$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
  });

  // 11. Already executed action does not execute again
  it("displays recovered badge and prevents execution for already executed action", () => {
    render(
      <RecoveryClient
        initialActions={[mockActions[2]]} // EXECUTED action
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    expect(screen.queryByRole("button", { name: /^execute$/i })).toBeNull();
    expect(screen.getAllByText("₹7,500").length).toBeGreaterThanOrEqual(1);
  });

  // 12. Loading state prevents duplicate clicks
  it("disables buttons while processing an action to prevent duplicate clicks", async () => {
    let resolveApprove: (value: unknown) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveApprove = resolve;
    });

    vi.mocked(global.fetch).mockReturnValueOnce(pendingPromise as Promise<Response>);

    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    const approveButton = screen.getAllByRole("button", { name: /^approve$/i })[0];
    fireEvent.click(approveButton);

    // Button should be disabled during flight
    expect(approveButton).toHaveProperty("disabled", true);

    // Resolve promise
    resolveApprove({
      ok: true,
      json: async () => ({ success: true }),
    });
  });
});
