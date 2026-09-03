"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  Check,
  X,
  ShieldCheck,
  RefreshCw,
  Clock,
  UserCheck,
  History,
  Info,
  Lock,
} from "lucide-react";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat, StatRow } from "@/components/ui/stat";
import { formatINR, formatDateTime, truncateId } from "@/lib/utils";
import { AiDiagnosisCard } from "@/components/recovery/ai-diagnosis-card";
import {
  RecoveryStatus,
  RecoveryActionType,
  UserRole,
  ClientAiPolicyDecision,
  canPerformOperationalActions,
} from "@/types/client";

export interface RecoveryActionItem {
  id: string;
  actionType: RecoveryActionType;
  status: RecoveryStatus;
  expectedRecoveryAmount: number | null;
  createdAt: string | Date;
  approvedAt: string | Date | null;
  executedAt: string | Date | null;
  config?: Record<string, unknown> | null;
  payment: {
    id: string;
    providerPaymentId: string | null;
    amount: number;
    currency: string;
    failureCategory: string | null;
    description?: string | null;
    createdAt?: string | Date;
    customer: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      lifetimeValue?: number;
      transactionCount?: number;
    };
    failures?: Array<{
      id: string;
      category: string;
      providerCode: string | null;
      providerDescription: string | null;
      isTransient: boolean;
      occurredAt: string | Date;
    }>;
  };
  aiAnalysis?: {
    id: string;
    diagnosis: string;
    confidence: number;
    recoveryProbability: number;
    recommendedAction: string;
    riskLevel: string;
    reasoning: string;
    modelProvider?: string;
    modelName?: string;
  } | null;
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  attempts?: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    result: string | null;
    recoveredAmount: number | null;
    attemptedAt: string | Date;
  }>;
  auditLogs?: Array<{
    id: string;
    eventType: string;
    actorType: string;
    description: string;
    createdAt: string | Date;
    metadata?: Record<string, unknown> | null;
  }>;
}

export interface RecoverySummaryData {
  totalActions: number;
  executed: number;
  pendingApproval: number;
  failed: number;
  totalRecoveredAmount: number;
}

export type StatusFilterTab =
  | "ALL"
  | "RECOMMENDED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "EXECUTED"
  | "FAILED"
  | "REJECTED"
  | "ESCALATED";

export interface RecoveryClientProps {
  initialActions: RecoveryActionItem[];
  summary: RecoverySummaryData;
  userRole?: UserRole | string;
}

export function RecoveryClient({
  initialActions,
  summary: initialSummary,
  userRole = UserRole.OPERATOR,
}: RecoveryClientProps) {
  const router = useRouter();
  const [actions, setActions] = React.useState<RecoveryActionItem[]>(initialActions);
  const [summary, setSummary] = React.useState<RecoverySummaryData>(initialSummary);
  const [activeTab, setActiveTab] = React.useState<StatusFilterTab>("ALL");
  const [isLoading, setIsLoading] = React.useState(false);
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = React.useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [selectedAction, setSelectedAction] = React.useState<RecoveryActionItem | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = React.useState(false);

  // Policy evaluation decision for drawer
  const [policyDecision, setPolicyDecision] = React.useState<ClientAiPolicyDecision | null>(null);

  const isViewer = !canPerformOperationalActions(userRole as UserRole);

  // Fetch actions from API when status filter changes
  async function fetchActions(tab: StatusFilterTab) {
    setIsLoading(true);
    setFeedbackMessage(null);

    try {
      const url =
        tab === "ALL"
          ? `/api/recovery?pageSize=50&includeSummary=true`
          : `/api/recovery?status=${tab}&pageSize=50&includeSummary=true`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load recovery actions (${res.status})`);
      }

      const data = await res.json();
      setActions(data.recoveryActions || []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error("Error fetching filtered recovery actions:", err);
      setFeedbackMessage({
        text: err instanceof Error ? err.message : "Error fetching recovery actions",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleTabChange(tab: StatusFilterTab) {
    setActiveTab(tab);
    fetchActions(tab);
  }

  // Load detailed action with audits & policy evaluation
  async function handleSelectRow(action: RecoveryActionItem) {
    setSelectedAction(action);
    setPolicyDecision(null);
    setIsLoadingDetail(true);

    try {
      // Parallel fetch full action details and real-time policy evaluation
      const [actionRes, evalRes] = await Promise.all([
        fetch(`/api/recovery/${action.id}`),
        fetch(`/api/recovery/${action.id}/evaluate`, { method: "POST" }),
      ]);

      if (actionRes.ok) {
        const fullAction = await actionRes.json();
        setSelectedAction(fullAction);
      }

      if (evalRes.ok) {
        const evalData = await evalRes.json();
        if (evalData.decision) {
          setPolicyDecision(evalData.decision);
        }
      }
    } catch (err) {
      console.error("Failed to load full action details:", err);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function handleApprove(actionId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (isViewer) return;

    setProcessingId(actionId);
    setFeedbackMessage(null);

    try {
      const res = await fetch(`/api/recovery/${actionId}/approve`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Approval failed");
      }

      const updatedApprovedAt = new Date();
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? { ...a, status: RecoveryStatus.APPROVED, approvedAt: updatedApprovedAt }
            : a
        )
      );

      if (selectedAction && selectedAction.id === actionId) {
        setSelectedAction((prev) =>
          prev
            ? { ...prev, status: RecoveryStatus.APPROVED, approvedAt: updatedApprovedAt }
            : null
        );
      }

      setFeedbackMessage({
        text: "Action approved by operator. Ready for execution.",
        type: "success",
      });
      router.refresh();
    } catch (err) {
      setFeedbackMessage({
        text: err instanceof Error ? err.message : "Failed to approve action",
        type: "error",
      });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(actionId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (isViewer) return;

    setProcessingId(actionId);
    setFeedbackMessage(null);

    try {
      const res = await fetch(`/api/recovery/${actionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Declined by merchant operator" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Rejection failed");
      }

      setActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: RecoveryStatus.REJECTED } : a))
      );

      if (selectedAction && selectedAction.id === actionId) {
        setSelectedAction((prev) =>
          prev ? { ...prev, status: RecoveryStatus.REJECTED } : null
        );
      }

      setFeedbackMessage({
        text: "Action was rejected and recorded in immutable audit log.",
        type: "info",
      });
      router.refresh();
    } catch (err) {
      setFeedbackMessage({
        text: err instanceof Error ? err.message : "Failed to reject action",
        type: "error",
      });
    } finally {
      setProcessingId(null);
    }
  }

  async function handleExecute(actionId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (isViewer) return;

    setProcessingId(actionId);
    setFeedbackMessage(null);

    try {
      const res = await fetch(`/api/recovery/${actionId}/execute`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Execution failed");
      }

      const now = new Date();
      if (data.success) {
        setActions((prev) =>
          prev.map((a) =>
            a.id === actionId
              ? {
                  ...a,
                  status: RecoveryStatus.EXECUTED,
                  executedAt: now,
                  expectedRecoveryAmount: data.recoveredAmount || a.expectedRecoveryAmount,
                }
              : a
          )
        );

        if (selectedAction && selectedAction.id === actionId) {
          setSelectedAction((prev) =>
            prev
              ? {
                  ...prev,
                  status: RecoveryStatus.EXECUTED,
                  executedAt: now,
                }
              : null
          );
        }

        setSummary((prev) => ({
          ...prev,
          executed: prev.executed + 1,
          totalRecoveredAmount: prev.totalRecoveredAmount + (data.recoveredAmount || 0),
        }));

        setFeedbackMessage({
          text: `Recovery execution succeeded! Recovered ${formatINR(
            data.recoveredAmount || 0
          )} (Simulated Sandbox).`,
          type: "success",
        });
      } else {
        setActions((prev) =>
          prev.map((a) => (a.id === actionId ? { ...a, status: RecoveryStatus.FAILED } : a))
        );

        if (selectedAction && selectedAction.id === actionId) {
          setSelectedAction((prev) =>
            prev ? { ...prev, status: RecoveryStatus.FAILED } : null
          );
        }

        setFeedbackMessage({
          text: `Recovery attempt was declined: ${data.message || data.error}`,
          type: "error",
        });
      }

      router.refresh();
    } catch (err) {
      setFeedbackMessage({
        text: err instanceof Error ? err.message : "Failed to execute recovery",
        type: "error",
      });
    } finally {
      setProcessingId(null);
    }
  }

  const getStatusBadge = (status: RecoveryStatus) => {
    switch (status) {
      case RecoveryStatus.EXECUTED:
        return <Badge tone="recovery" dot>Recovered</Badge>;
      case RecoveryStatus.APPROVED:
        return <Badge tone="ai" dot>Approved</Badge>;
      case RecoveryStatus.PENDING_APPROVAL:
        return <Badge tone="risk" dot>Pending Approval</Badge>;
      case RecoveryStatus.RECOMMENDED:
        return <Badge tone="info">Recommended</Badge>;
      case RecoveryStatus.FAILED:
        return <Badge tone="danger">Failed</Badge>;
      case RecoveryStatus.ESCALATED:
        return <Badge tone="risk">Escalated</Badge>;
      case RecoveryStatus.REJECTED:
        return <Badge tone="neutral">Rejected</Badge>;
      default:
        return <Badge tone="neutral">{status}</Badge>;
    }
  };

  const tabs: { key: StatusFilterTab; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "RECOMMENDED", label: "Recommended" },
    { key: "PENDING_APPROVAL", label: "Pending Approval" },
    { key: "APPROVED", label: "Approved" },
    { key: "EXECUTED", label: "Executed" },
    { key: "FAILED", label: "Failed" },
    { key: "REJECTED", label: "Rejected" },
    { key: "ESCALATED", label: "Escalated" },
  ];

  return (
    <div className="space-y-6">
      {/* Recovery Performance KPI Row */}
      <StatRow>
        <Stat
          label="Total Recovered"
          value={formatINR(summary.totalRecoveredAmount)}
          delta={18.4}
        />
        <Stat
          label="Recovered Workflows"
          value={summary.executed.toLocaleString("en-IN")}
          delta={24.2}
        />
        <Stat
          label="Pending Approvals"
          value={summary.pendingApproval.toLocaleString("en-IN")}
          delta={-4.8}
          deltaGoodDirection="down"
        />
        <Stat
          label="Failed Retries"
          value={summary.failed.toLocaleString("en-IN")}
          delta={-11.2}
          deltaGoodDirection="down"
        />
        <Stat
          label="Recovery Pipeline"
          value={summary.totalActions.toLocaleString("en-IN")}
          delta={8.3}
        />
        <Stat
          label="Conversion Efficiency"
          value={
            summary.totalActions > 0
              ? `${((summary.executed / summary.totalActions) * 100).toFixed(1)}%`
              : "0%"
          }
          delta={5.7}
        />
      </StatRow>

      {/* Safety Notice & Viewer Role Warning Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-app border border-line bg-surface-raised px-4 py-2.5 text-[12.5px]">
        <div className="flex items-center gap-2 text-ink-muted">
          <Info className="h-4 w-4 text-ai shrink-0" />
          <span>
            <strong className="text-ink">Bounded Recovery Mode:</strong> Automated actions adhere strictly to deterministic merchant policies. Executions simulate payment capture without real money movement.
          </span>
        </div>
        {isViewer && (
          <div className="flex items-center gap-1.5 rounded bg-risk-soft px-2 py-0.5 text-[11.5px] font-medium text-risk">
            <Lock className="h-3 w-3" />
            <span>Viewer Mode (Read-Only)</span>
          </div>
        )}
      </div>

      {/* Feedback Alert */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between rounded-app border p-3.5 text-[13px] ${
            feedbackMessage.type === "success"
              ? "border-recovery/30 bg-recovery-soft text-recovery"
              : feedbackMessage.type === "info"
              ? "border-ai/30 bg-ai-soft text-ai"
              : "border-danger/30 bg-danger-soft text-danger"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : feedbackMessage.type === "info" ? (
              <Info className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-ink-muted hover:text-ink"
            aria-label="Dismiss feedback"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Recovery Queue Panel */}
      <Panel>
        <PanelHeader>
          <div className="flex items-center gap-2">
            <PanelTitle>Autonomous Recovery Queue</PanelTitle>
            <Badge tone="ai" dot>
              Human-in-the-Loop Active
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Filter Tab Bar */}
            <div className="flex flex-wrap items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`rounded-app px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-ink text-paper"
                      : "text-ink-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchActions(activeTab)}
              disabled={isLoading}
              className="h-7 px-2 text-[11.5px]"
              aria-label="Refresh recovery queue"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin text-ai" : ""}`} />
            </Button>
          </div>
        </PanelHeader>

        {isLoading ? (
          <PanelBody className="py-16 text-center text-ink-faint">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-ai" />
            <p className="mt-3 text-[13.5px] text-ink-muted">Loading recovery actions…</p>
          </PanelBody>
        ) : actions.length === 0 ? (
          <PanelBody className="py-16 text-center text-ink-muted">
            <CheckCircle2 className="mx-auto h-8 w-8 text-recovery" />
            <p className="mt-2 text-[14px] font-semibold text-ink">
              Queue clear for filter: {tabs.find((t) => t.key === activeTab)?.label}
            </p>
            <p className="text-[12.5px] text-ink-muted">
              No recovery actions currently match this status filter.
            </p>
          </PanelBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Opportunity / ID</TH>
                <TH>Customer</TH>
                <TH>Amount</TH>
                <TH>Recovery Odds</TH>
                <TH>Risk Level</TH>
                <TH>Intervention</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {actions.map((action) => {
                const ai = action.aiAnalysis;
                const isProcessing = processingId === action.id;
                const paymentIdDisplay = truncateId(
                  action.payment.providerPaymentId || action.payment.id,
                  16
                );

                return (
                  <TR
                    key={action.id}
                    clickable
                    onClick={() => handleSelectRow(action)}
                    className="hover:bg-surface/80"
                  >
                    <TD className="tabular font-medium text-ink">
                      {paymentIdDisplay}
                    </TD>
                    <TD>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">
                          {action.payment.customer.name}
                        </span>
                        <span className="text-[11.5px] text-ink-faint">
                          {action.payment.failureCategory?.replace(/_/g, " ") || "Unclassified"}
                        </span>
                      </div>
                    </TD>
                    <TD className="tabular font-semibold text-ink">
                      {formatINR(action.payment.amount)}
                    </TD>
                    <TD className="tabular font-semibold">
                      {ai ? (
                        <span
                          className={
                            ai.recoveryProbability >= 0.7
                              ? "text-recovery"
                              : ai.recoveryProbability >= 0.4
                              ? "text-risk"
                              : "text-danger"
                          }
                        >
                          {(ai.recoveryProbability * 100).toFixed(0)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          ai?.riskLevel === "LOW"
                            ? "recovery"
                            : ai?.riskLevel === "MEDIUM"
                            ? "risk"
                            : "danger"
                        }
                      >
                        {ai?.riskLevel || "LOW"}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          action.actionType === "RETRY_PAYMENT"
                            ? "recovery"
                            : action.actionType === "SEND_REMINDER"
                            ? "ai"
                            : "info"
                        }
                      >
                        {action.actionType.replace(/_/g, " ")}
                      </Badge>
                    </TD>
                    <TD>{getStatusBadge(action.status)}</TD>
                    <TD className="tabular text-[12px] text-ink-faint">
                      {formatDateTime(action.createdAt)}
                    </TD>
                    <TD className="text-right">
                      <div
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {action.status === RecoveryStatus.PENDING_APPROVAL ||
                        action.status === RecoveryStatus.RECOMMENDED ? (
                          !isViewer ? (
                            <>
                              <Button
                                size="sm"
                                variant="recovery"
                                disabled={isProcessing}
                                onClick={(e) => handleApprove(action.id, e)}
                                className="h-7 px-2 text-[12px]"
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isProcessing}
                                onClick={(e) => handleReject(action.id, e)}
                                className="h-7 px-2 text-[12px] text-danger hover:bg-danger-soft"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-[11.5px] text-ink-faint">Requires Operator</span>
                          )
                        ) : action.status === RecoveryStatus.APPROVED ? (
                          !isViewer ? (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={isProcessing}
                              onClick={(e) => handleExecute(action.id, e)}
                              className="h-7 px-2.5 text-[12px]"
                            >
                              <Play className="h-3.5 w-3.5" /> Execute
                            </Button>
                          ) : (
                            <span className="text-[11.5px] text-ink-faint">Approved</span>
                          )
                        ) : action.status === RecoveryStatus.EXECUTED ? (
                          <span className="text-[12px] font-medium text-recovery">
                            {formatINR(action.expectedRecoveryAmount || action.payment.amount)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-ink-faint">—</span>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Panel>

      {/* Recovery Detail Drawer */}
      {selectedAction && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-xl flex-col bg-surface-raised shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-ink">Recovery Opportunity</h3>
                  {getStatusBadge(selectedAction.status)}
                </div>
                <p className="tabular mt-0.5 text-[12.5px] text-ink-faint">
                  Payment: {selectedAction.payment.providerPaymentId || selectedAction.payment.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedAction(null)}
                className="rounded-app p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
                aria-label="Close detail drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-5 p-6">
              {/* Financial Box */}
              <div className="grid grid-cols-2 gap-3 rounded-app border border-line bg-surface p-4">
                <div>
                  <span className="text-[11.5px] text-ink-faint">At Risk Amount</span>
                  <p className="tabular text-[20px] font-semibold text-ink">
                    {formatINR(selectedAction.payment.amount)}
                  </p>
                  <span className="text-[11px] text-ink-faint">
                    Expected: {formatINR(selectedAction.expectedRecoveryAmount || selectedAction.payment.amount)}
                  </span>
                </div>
                <div>
                  <span className="text-[11.5px] text-ink-faint">Customer</span>
                  <p className="text-[14px] font-medium text-ink">
                    {selectedAction.payment.customer.name}
                  </p>
                  <p className="text-[11.5px] text-ink-faint">
                    {selectedAction.payment.customer.email}
                  </p>
                  {selectedAction.payment.customer.phone && (
                    <p className="text-[11px] text-ink-faint">
                      {selectedAction.payment.customer.phone}
                    </p>
                  )}
                </div>
              </div>

              {/* 1. AI Recommendation Box */}
              <div className="rounded-app border border-line bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                    AI Diagnosis &amp; Recommendation
                  </span>
                  <Badge tone="ai">Advisory Only</Badge>
                </div>

                {selectedAction.aiAnalysis ? (
                  <AiDiagnosisCard
                    diagnosis={selectedAction.aiAnalysis.diagnosis}
                    confidence={selectedAction.aiAnalysis.confidence}
                    recoveryProbability={selectedAction.aiAnalysis.recoveryProbability}
                    riskLevel={selectedAction.aiAnalysis.riskLevel}
                    recommendedAction={selectedAction.aiAnalysis.recommendedAction}
                    expectedRecoveryAmount={selectedAction.expectedRecoveryAmount || selectedAction.payment.amount}
                    reasoning={selectedAction.aiAnalysis.reasoning}
                    failureCategory={selectedAction.payment.failureCategory}
                    modelName={selectedAction.aiAnalysis.modelName || "Claude / Gemini"}
                    source={
                      selectedAction.aiAnalysis.modelProvider === "deterministic_fallback"
                        ? "deterministic_fallback"
                        : "claude"
                    }
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[12.5px] font-medium text-ink">
                        Baseline Action: {selectedAction.actionType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <Badge tone="neutral">Standard Queue Item</Badge>
                  </div>
                )}
              </div>

              {/* 2. Authoritative Policy Decision Box */}
              <div className="rounded-app border border-line-strong bg-surface-raised p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-ai" />
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-ink">
                      Deterministic Recovery Policy Gate
                    </span>
                  </div>
                  {policyDecision ? (
                    <Badge
                      tone={
                        policyDecision.status === "AI_RECOMMENDATION_ACCEPTED"
                          ? "recovery"
                          : policyDecision.status === "AI_RECOMMENDATION_REQUIRES_APPROVAL"
                          ? "risk"
                          : "danger"
                      }
                      dot
                    >
                      {policyDecision.status === "AI_RECOMMENDATION_ACCEPTED"
                        ? "Policy: Accepted"
                        : policyDecision.status === "AI_RECOMMENDATION_REQUIRES_APPROVAL"
                        ? "Policy: Approval Required"
                        : policyDecision.status === "AI_RECOMMENDATION_ESCALATED"
                        ? "Policy: Escalated"
                        : "Policy: Rejected"}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Evaluating Policy Rules…</Badge>
                  )}
                </div>

                <div className="space-y-2 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-faint">Policy Permitted Action:</span>
                    <span className="font-semibold text-ink">
                      {policyDecision
                        ? policyDecision.policyPermittedAction.replace(/_/g, " ")
                        : selectedAction.actionType.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-ink-faint shrink-0">Policy Rule Guidance:</span>
                    <span className="text-right font-medium text-ink-muted">
                      {policyDecision?.policyReason ||
                        "Deterministic safety policies govern whether this action can proceed."}
                    </span>
                  </div>

                  {policyDecision?.policyFlags && policyDecision.policyFlags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {policyDecision.policyFlags.map((flag) => (
                        <span
                          key={flag}
                          className="rounded bg-surface px-1.5 py-0.5 text-[10.5px] font-mono text-ink-faint"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Approval History / Sign-Off */}
              {selectedAction.approvedBy ? (
                <div className="flex items-center gap-2 rounded-app border border-recovery/30 bg-recovery-soft/40 p-3 text-[12.5px] text-ink">
                  <UserCheck className="h-4 w-4 text-recovery shrink-0" />
                  <div>
                    <span className="font-semibold">Approved by:</span>{" "}
                    {selectedAction.approvedBy.name} ({selectedAction.approvedBy.email}) on{" "}
                    {selectedAction.approvedAt
                      ? formatDateTime(selectedAction.approvedAt)
                      : "—"}
                  </div>
                </div>
              ) : selectedAction.status === RecoveryStatus.PENDING_APPROVAL ? (
                <div className="flex items-center gap-2 rounded-app border border-risk/30 bg-risk-soft/40 p-3 text-[12.5px] text-ink">
                  <Clock className="h-4 w-4 text-risk shrink-0" />
                  <div>
                    <span className="font-semibold text-risk">Human Approval Required:</span>{" "}
                    An operator with Operator or Admin privileges must review and approve this intervention before execution.
                  </div>
                </div>
              ) : null}

              {/* Previous Recovery Attempts Timeline */}
              {selectedAction.attempts && selectedAction.attempts.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">
                    Recovery Attempt Records ({selectedAction.attempts.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedAction.attempts.map((att) => (
                      <div
                        key={att.id}
                        className="rounded-app border border-line bg-surface p-3 text-[12.5px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">
                            Attempt #{att.attemptNumber}
                          </span>
                          <Badge
                            tone={att.status === "EXECUTED" ? "recovery" : "danger"}
                          >
                            {att.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-ink-muted">{att.result}</p>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-faint">
                          <span>{formatDateTime(att.attemptedAt)}</span>
                          {att.recoveredAmount ? (
                            <span className="font-semibold text-recovery">
                              Recovered {formatINR(att.recoveredAmount)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Immutable Audit History */}
              {selectedAction.auditLogs && selectedAction.auditLogs.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-ink-faint" />
                    <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">
                      Audit Trail
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {selectedAction.auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-app border border-line bg-surface p-2.5 text-[12px]"
                      >
                        <div className="flex items-center justify-between">
                          <Badge tone="neutral">{log.eventType}</Badge>
                          <span className="text-[11px] text-ink-faint">
                            {formatDateTime(log.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-ink-muted">{log.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Interactive Controls */}
            <div className="border-t border-line bg-surface px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAction(null)}
                >
                  Close
                </Button>

                {isViewer ? (
                  <div className="flex items-center gap-1 text-[12px] text-ink-faint">
                    <Lock className="h-3.5 w-3.5" />
                    <span>Viewer Mode (Read-Only)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {selectedAction.status === RecoveryStatus.PENDING_APPROVAL ||
                    selectedAction.status === RecoveryStatus.RECOMMENDED ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={processingId === selectedAction.id || isLoadingDetail}
                          onClick={() => handleReject(selectedAction.id)}
                        >
                          Reject Action
                        </Button>
                        <Button
                          size="sm"
                          variant="recovery"
                          disabled={processingId === selectedAction.id || isLoadingDetail}
                          onClick={() => handleApprove(selectedAction.id)}
                        >
                          Approve Recovery
                        </Button>
                      </>
                    ) : selectedAction.status === RecoveryStatus.APPROVED ? (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={processingId === selectedAction.id || isLoadingDetail}
                        onClick={() => handleExecute(selectedAction.id)}
                      >
                        <Play className="h-3.5 w-3.5" /> Execute Workflow Now
                      </Button>
                    ) : selectedAction.status === RecoveryStatus.EXECUTED ? (
                      <Badge tone="recovery" dot>
                        Recovered ({formatINR(selectedAction.expectedRecoveryAmount || selectedAction.payment.amount)})
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{selectedAction.status}</Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
