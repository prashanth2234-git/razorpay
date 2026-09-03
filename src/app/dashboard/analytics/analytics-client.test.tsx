import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import { AnalyticsClient } from "./analytics-client";
import {
  RecoveryAnalyticsData,
  FailureCategory,
  RecoveryActionType,
} from "@/types/client";

describe("Analytics Dashboard UI Component (Milestone 7 Step 11A)", () => {
  const mockAnalyticsData: RecoveryAnalyticsData = {
    merchantId: "merch_demo_123",
    currency: "INR",
    isSimulated: true,
    revenueAtRisk: 2500000, // ₹25,000
    expectedRecoverable: 2000000, // ₹20,000
    recoveredRevenue: 1650000, // ₹16,500
    recoveryRate: 66.0,
    totalRecoveryAttempts: 42,
    successfulRecoveries: 28,
    failedRecoveries: 14,
    pendingApprovalCount: 8,
    recoveryPipelineCount: 18,
    averageRecoveredAmount: 58928, // ₹589.28
    byCategory: [
      {
        category: FailureCategory.TEMPORARY_ISSUER_FAILURE,
        opportunities: 20,
        revenueAtRisk: 1200000,
        expectedRecoverable: 1100000,
        recoveredRevenue: 1000000,
        recoveryRate: 83.3,
      },
      {
        category: FailureCategory.INSUFFICIENT_FUNDS,
        opportunities: 15,
        revenueAtRisk: 800000,
        expectedRecoverable: 600000,
        recoveredRevenue: 450000,
        recoveryRate: 56.3,
      },
    ],
    byActionType: [
      {
        actionType: RecoveryActionType.RETRY_PAYMENT,
        opportunities: 25,
        executed: 20,
        failed: 5,
        recoveredRevenue: 1200000,
        successRate: 80.0,
      },
      {
        actionType: RecoveryActionType.SEND_REMINDER,
        opportunities: 12,
        executed: 8,
        failed: 4,
        recoveredRevenue: 450000,
        successRate: 66.7,
      },
    ],
    trend: [
      {
        date: "2026-08-01",
        revenueAtRisk: 500000,
        expectedRecoverable: 400000,
        recoveredRevenue: 300000,
        successfulRecoveries: 5,
      },
      {
        date: "2026-08-02",
        revenueAtRisk: 600000,
        expectedRecoverable: 500000,
        recoveredRevenue: 450000,
        successfulRecoveries: 7,
      },
    ],
    aiPolicy: {
      aiRecommendationsCount: 38,
      policyAcceptedCount: 28,
      policyRejectedCount: 4,
      approvalRequiredCount: 8,
      executedActionsCount: 28,
      avgConfidence: 0.94,
      avgRecoveryProbability: 0.86,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => mockAnalyticsData,
    }));
  });

  // 1. Top KPI Rendering
  it("renders top financial KPI cards with formatted INR values", () => {
    render(<AnalyticsClient initialData={mockAnalyticsData} />);

    expect(screen.getByText("Revenue at Risk")).toBeDefined();
    expect(screen.getByText("₹25,000")).toBeDefined();

    expect(screen.getByText("Expected Recoverable")).toBeDefined();
    expect(screen.getByText("₹20,000")).toBeDefined();

    expect(screen.getByText("Recovered Revenue (Simulated)")).toBeDefined();
    expect(screen.getByText("₹16,500")).toBeDefined();

    expect(screen.getByText("Recovery Rate")).toBeDefined();
    expect(screen.getByText("66%")).toBeDefined();
  });

  // 2. Secondary KPIs
  it("renders secondary execution KPIs", () => {
    render(<AnalyticsClient initialData={mockAnalyticsData} />);

    expect(screen.getByText("Recovery Attempts")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();

    expect(screen.getByText("Successful Recoveries")).toBeDefined();
    expect(screen.getAllByText("28").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("Failed Retries")).toBeDefined();
    expect(screen.getByText("14")).toBeDefined();

    expect(screen.getByText("Pending Human Approval")).toBeDefined();
    expect(screen.getAllByText("8").length).toBeGreaterThanOrEqual(1);
  });

  // 3. Simulated recovery banner
  it("renders simulated sandbox recovery notice banner", () => {
    render(<AnalyticsClient initialData={mockAnalyticsData} />);

    expect(screen.getByText(/simulated recovery analytics:/i)).toBeDefined();
    expect(screen.getByText(/sandbox analytics active/i)).toBeDefined();
  });

  // 4. Failure category table breakdown
  it("renders breakdown by failure category", () => {
    render(<AnalyticsClient initialData={mockAnalyticsData} />);

    expect(screen.getAllByText("TEMPORARY ISSUER FAILURE").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("INSUFFICIENT FUNDS").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("83.3%")).toBeDefined();
    expect(screen.getByText("56.3%")).toBeDefined();
  });

  // 5. Action type table breakdown
  it("renders breakdown by intervention action type", () => {
    render(<AnalyticsClient initialData={mockAnalyticsData} />);

    expect(screen.getByText("RETRY PAYMENT")).toBeDefined();
    expect(screen.getByText("SEND REMINDER")).toBeDefined();
  });

  // 6. AI & Policy Funnel metrics
  it("renders AI & Deterministic Policy Safety Funnel", () => {
    render(<AnalyticsClient initialData={mockAnalyticsData} />);

    expect(screen.getByText("AI Diagnoses")).toBeDefined();
    expect(screen.getByText("38")).toBeDefined();
    expect(screen.getByText("94%")).toBeDefined();
    expect(screen.getByText("86%")).toBeDefined();
  });

  // 7. Time range filtering
  it("triggers refetch when changing time range", async () => {
    render(<AnalyticsClient initialData={mockAnalyticsData} />);

    const button7d = screen.getByRole("button", { name: /^7 days$/i });
    fireEvent.click(button7d);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/analytics/recovery?startDate=")
      );
    });
  });
});
