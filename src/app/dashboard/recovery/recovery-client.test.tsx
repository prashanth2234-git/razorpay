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

describe("Recovery Dashboard UI Component (Milestone 6 Step 10A)", () => {
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
    global.fetch = vi.fn();
  });

  it("renders real recovery actions with customer names, order amounts, recovery odds, and status badges", () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    // Verify customer names rendered
    expect(screen.getByText("Ravi Shankar")).toBeDefined();
    expect(screen.getByText("Priya Sharma")).toBeDefined();
    expect(screen.getByText("Amit Patel")).toBeDefined();

    // Verify recovery odds rendered
    expect(screen.getByText("90%")).toBeDefined();
    expect(screen.getByText("65%")).toBeDefined();
    expect(screen.getByText("95%")).toBeDefined();

    // Verify KPI summary metrics rendered
    expect(screen.getAllByText("₹7,500").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Approve and Reject buttons for operators on PENDING_APPROVAL actions", () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    // Approve button should exist for pending item rec_001
    const approveButtons = screen.getAllByRole("button", { name: /approve/i });
    expect(approveButtons.length).toBeGreaterThanOrEqual(1);

    // Execute button should exist for approved item rec_002
    const executeButtons = screen.getAllByRole("button", { name: /execute/i });
    expect(executeButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("restricts VIEWER role from approving or executing recovery actions", () => {
    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.VIEWER}
      />
    );

    // Viewer banner
    expect(screen.getByText(/viewer mode \(read-only\)/i)).toBeDefined();

    // Approve and Execute buttons should NOT be present for viewer
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^execute$/i })).toBeNull();
    expect(screen.getByText("Requires Operator")).toBeDefined();
  });

  it("filters actions by status when status filter tab is clicked", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        recoveryActions: [mockActions[1]], // only APPROVED action
        summary: mockSummary,
      }),
    } as Response);

    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    // Click 'Approved' tab
    const approvedTab = screen.getByRole("button", { name: "Approved" });
    fireEvent.click(approvedTab);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/recovery?status=APPROVED")
      );
    });
  });

  it("opens recovery detail drawer with AI advisory and policy decision when row is clicked", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockActions[0],
      } as Response)
      .mockResolvedValueOnce({
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
            policyReason: "Automated retry requires human sign-off for temporary issuer downtime.",
            policyFlags: [],
          },
        }),
      } as Response);

    render(
      <RecoveryClient
        initialActions={mockActions}
        summary={mockSummary}
        userRole={UserRole.OPERATOR}
      />
    );

    // Click on Ravi Shankar row
    const row = screen.getByText("Ravi Shankar");
    fireEvent.click(row);

    // Detail drawer should open
    await waitFor(() => {
      expect(screen.getByText("Recovery Opportunity")).toBeDefined();
      expect(screen.getByText(/AI Diagnosis & Recommendation/i)).toBeDefined();
      expect(screen.getByText(/Deterministic Recovery Policy Gate/i)).toBeDefined();
      expect(screen.getByText("Advisory Only")).toBeDefined();
    });
  });

  it("handles empty queue state gracefully", () => {
    render(
      <RecoveryClient
        initialActions={[]}
        summary={{
          totalActions: 0,
          executed: 0,
          pendingApproval: 0,
          failed: 0,
          totalRecoveredAmount: 0,
        }}
        userRole={UserRole.OPERATOR}
      />
    );

    expect(screen.getByText(/queue clear for filter: all/i)).toBeDefined();
    expect(screen.getByText(/no recovery actions currently match this status filter/i)).toBeDefined();
  });
});
