import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { AuditLogsClient } from "./audit-logs-client";
import {
  AuditLogsResponse,
  AuditEventType,
  ActorType,
} from "@/types/client";

describe("Audit Logs Client Component (Milestone 7 Step 12A)", () => {
  const mockAuditData: AuditLogsResponse = {
    total: 3,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    auditLogs: [
      {
        id: "log_ai_1",
        merchantId: "merch_123",
        userId: null,
        paymentId: "pay_test_001",
        recoveryActionId: "rec_act_001",
        actorType: ActorType.AI_AGENT,
        eventType: AuditEventType.AI_DIAGNOSIS_GENERATED,
        description: "AI Agent (gemini) generated diagnosis: RETRY_PAYMENT (92% confidence)",
        metadata: {
          confidence: 0.92,
          recoveryProbability: 0.88,
          provider: "gemini",
        },
        createdAt: "2026-08-20T10:00:00Z",
        payment: {
          id: "pay_test_001",
          providerPaymentId: "pay_rzp_12345",
          amount: 450000,
          currency: "INR",
          status: "FAILED",
          customer: {
            name: "Rahul Verma",
            email: "rahul@example.com",
          },
        },
        recoveryAction: {
          id: "rec_act_001",
          actionType: "RETRY_PAYMENT",
          status: "RECOMMENDED",
        },
      },
      {
        id: "log_user_2",
        merchantId: "merch_123",
        userId: "usr_admin",
        paymentId: "pay_test_001",
        recoveryActionId: "rec_act_001",
        actorType: ActorType.USER,
        eventType: AuditEventType.RECOVERY_ACTION_APPROVED,
        description: "Approved recovery action RETRY_PAYMENT for payment pay_rzp_12345",
        metadata: {
          approvedBy: "Farhan Merchant",
        },
        createdAt: "2026-08-20T10:05:00Z",
        user: {
          id: "usr_admin",
          name: "Farhan Merchant",
          email: "farhan@kaveritextiles.com",
          role: "ADMIN",
        },
        payment: {
          id: "pay_test_001",
          providerPaymentId: "pay_rzp_12345",
          amount: 450000,
          currency: "INR",
          status: "RECOVERY_PENDING",
        },
      },
      {
        id: "log_exec_3",
        merchantId: "merch_123",
        userId: null,
        paymentId: "pay_test_001",
        recoveryActionId: "rec_act_001",
        actorType: ActorType.SYSTEM,
        eventType: AuditEventType.RECOVERY_ATTEMPT_SUCCEEDED,
        description: "Successfully recovered ₹4,500 via RETRY_PAYMENT",
        metadata: {
          recoveredAmount: 450000,
          isSimulated: true,
        },
        createdAt: "2026-08-20T10:10:00Z",
        payment: {
          id: "pay_test_001",
          providerPaymentId: "pay_rzp_12345",
          amount: 450000,
          currency: "INR",
          status: "RECOVERED",
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => mockAuditData,
    }));
  });

  // 1. Renders Audit Logs list with correct event badges
  it("renders audit logs with correct event badges and descriptions", () => {
    render(<AuditLogsClient initialData={mockAuditData} />);

    expect(screen.getAllByText("AI Advisory").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Approved (Operator)")).toBeDefined();
    expect(screen.getByText("Captured (Simulated)")).toBeDefined();

    expect(
      screen.getByText(/AI Agent \(gemini\) generated diagnosis: RETRY_PAYMENT/i)
    ).toBeDefined();
    expect(
      screen.getByText(/Approved recovery action RETRY_PAYMENT/i)
    ).toBeDefined();
  });

  // 2. Explainability and Actor separation
  it("clearly distinguishes AI advisory from human operator approvals", () => {
    render(<AuditLogsClient initialData={mockAuditData} />);

    expect(screen.getByText("Farhan Merchant")).toBeDefined();
    expect(screen.getAllByText("AI AGENT").length).toBeGreaterThanOrEqual(1);
  });

  // 3. Opens detail drawer on row click
  it("opens the detail drawer when an audit log row is clicked", () => {
    render(<AuditLogsClient initialData={mockAuditData} />);

    const row = screen.getByText(/AI Agent \(gemini\) generated diagnosis/i);
    fireEvent.click(row);

    expect(screen.getByText("Audit Event Details")).toBeDefined();
    expect(screen.getByText("Structured Audit Metadata (Sanitized)")).toBeDefined();
    expect(screen.getByText("Rahul Verma")).toBeDefined();
  });

  // 4. Filter interaction triggers API query
  it("triggers API query when changing the event type filter", async () => {
    render(<AuditLogsClient initialData={mockAuditData} />);

    const select = screen.getByDisplayValue("All Event Types");
    fireEvent.change(select, {
      target: { value: AuditEventType.RECOVERY_ACTION_APPROVED },
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          `/api/audit-logs?page=1&pageSize=25&eventType=${AuditEventType.RECOVERY_ACTION_APPROVED}`
        )
      );
    });
  });
});
