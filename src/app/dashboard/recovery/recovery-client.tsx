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
} from "lucide-react";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat, StatRow } from "@/components/ui/stat";
import { formatINR, formatDateTime, truncateId } from "@/lib/utils";
import { AiDiagnosisCard } from "@/components/recovery/ai-diagnosis-card";
import { RecoveryStatus, RecoveryActionType } from "@prisma/client";
import { AiPolicyDecision } from "@/server/recovery/ai-policy";

interface RecoveryActionItem {
  id: string;
  actionType: RecoveryActionType;
  status: RecoveryStatus;
  expectedRecoveryAmount: number | null;
  createdAt: string | Date;
  approvedAt: string | Date | null;
  executedAt: string | Date | null;
  payment: {
    id: string;
    providerPaymentId: string | null;
    amount: number;
    currency: string;
    failureCategory: string | null;
    customer: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
    };
  };
  aiAnalysis?: {
    id: string;
    diagnosis: string;
    confidence: number;
    recoveryProbability: number;
    recommendedAction: string;
    riskLevel: string;
    reasoning: string;
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
}

interface RecoveryClientProps {
  initialActions: RecoveryActionItem[];
  summary: {
    totalActions: number;
    executed: number;
    pendingApproval: number;
    failed: number;
    totalRecoveredAmount: number;
  };
}

export function RecoveryClient({ initialActions, summary }: RecoveryClientProps) {
  const router = useRouter();
  const [actions, setActions] = React.useState<RecoveryActionItem[]>(initialActions);
  const [activeTab, setActiveTab] = React.useState<"ALL" | "PENDING" | "APPROVED" | "EXECUTED" | "FAILED" | "ESCALATED">("ALL");
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = React.useState<{ text: string; type: "success" | "error" } | null>(null);
  const [selectedAction, setSelectedAction] = React.useState<RecoveryActionItem | null>(null);

  // Policy evaluation state for the drawer
  const [policyDecision, setPolicyDecision] = React.useState<AiPolicyDecision | null>(null);

  // Filter actions based on active tab
  const filteredActions = React.useMemo(() => {
    if (activeTab === "PENDING") {
      return actions.filter(
        (a) =>
          a.status === RecoveryStatus.PENDING_APPROVAL ||
          a.status === RecoveryStatus.RECOMMENDED
      );
    }
    if (activeTab === "APPROVED") {
      return actions.filter((a) => a.status === RecoveryStatus.APPROVED);
    }
    if (activeTab === "EXECUTED") {
      return actions.filter((a) => a.status === RecoveryStatus.EXECUTED);
    }
    if (activeTab === "FAILED") {
      return actions.filter((a) => a.status === RecoveryStatus.FAILED);
    }
    if (activeTab === "ESCALATED") {
      return actions.filter((a) => a.status === RecoveryStatus.ESCALATED);
    }
    return actions;
  }, [actions, activeTab]);

  async function handleSelectRow(action: RecoveryActionItem) {
    setSelectedAction(action);
    setPolicyDecision(null);

    try {
      const res = await fetch(`/api/recovery/${action.id}/evaluate`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.decision) {
          setPolicyDecision(data.decision);
        }
      }
    } catch (err) {
      console.error("Failed to evaluate policy for action:", err);
    }
  }

  async function handleApprove(actionId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
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

      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? { ...a, status: RecoveryStatus.APPROVED, approvedAt: new Date() }
            : a
        )
      );
      if (selectedAction && selectedAction.id === actionId) {
        setSelectedAction((prev) =>
          prev ? { ...prev, status: RecoveryStatus.APPROVED, approvedAt: new Date() } : null
        );
      }
      setFeedbackMessage({
        text: `Action approved successfully by operator. Ready for execution.`,
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
    setProcessingId(actionId);
    setFeedbackMessage(null);

    try {
      const res = await fetch(`/api/recovery/${actionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Declined by operator" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Rejection failed");
      }

      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId ? { ...a, status: RecoveryStatus.REJECTED } : a
        )
      );
      if (selectedAction && selectedAction.id === actionId) {
        setSelectedAction((prev) =>
          prev ? { ...prev, status: RecoveryStatus.REJECTED } : null
        );
      }
      setFeedbackMessage({
        text: `Action was marked as rejected and logged to audit trail.`,
        type: "success",
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

      if (data.success) {
        setActions((prev) =>
          prev.map((a) =>
            a.id === actionId
              ? { ...a, status: RecoveryStatus.EXECUTED, executedAt: new Date() }
              : a
          )
        );
        if (selectedAction && selectedAction.id === actionId) {
          setSelectedAction((prev) =>
            prev ? { ...prev, status: RecoveryStatus.EXECUTED, executedAt: new Date() } : null
          );
        }
        setFeedbackMessage({
          text: `Recovery execution succeeded! Recovered ${formatINR(data.result.recoveredAmount)}.`,
          type: "success",
        });
      } else {
        setActions((prev) =>
          prev.map((a) =>
            a.id === actionId ? { ...a, status: RecoveryStatus.FAILED } : a
          )
        );
        if (selectedAction && selectedAction.id === actionId) {
          setSelectedAction((prev) =>
            prev ? { ...prev, status: RecoveryStatus.FAILED } : null
          );
        }
        setFeedbackMessage({
          text: `Recovery attempt was declined: ${data.result.message}`,
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
        return <Badge tone="risk">Pending Approval</Badge>;
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

      {/* Feedback Alert */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between rounded-app border p-3.5 text-[13px] ${
            feedbackMessage.type === "success"
              ? "border-recovery/30 bg-recovery-soft text-recovery"
              : "border-danger/30 bg-danger-soft text-danger"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-ink-muted hover:text-ink"
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
          <div className="flex items-center gap-1">
            {(["ALL", "PENDING", "APPROVED", "EXECUTED", "FAILED", "ESCALATED"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-app px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-ink text-paper"
                      : "text-ink-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {tab === "ALL" ? "All" : tab.replace(/_/g, " ")}
                </button>
              )
            )}
          </div>
        </PanelHeader>

        {filteredActions.length === 0 ? (
          <PanelBody className="py-16 text-center text-ink-muted">
            <CheckCircle2 className="mx-auto h-8 w-8 text-recovery" />
            <p className="mt-2 text-[14px] font-semibold text-ink">Queue clear in this category</p>
            <p className="text-[12.5px] text-ink-muted">All active recovery opportunities have been addressed.</p>
          </PanelBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Opportunity</TH>
                <TH>Customer</TH>
                <TH>Order Value</TH>
                <TH>Recovery Odds</TH>
                <TH>Risk Level</TH>
                <TH>Intervention</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredActions.map((action) => {
                const ai = action.aiAnalysis;
                const isProcessing = processingId === action.id;

                return (
                  <TR
                    key={action.id}
                    clickable
                    onClick={() => handleSelectRow(action)}
                    className="hover:bg-surface/80"
                  >
                    <TD className="tabular font-medium text-ink">
                      {truncateId(action.payment.providerPaymentId || action.payment.id, 16)}
                    </TD>
                    <TD>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{action.payment.customer.name}</span>
                        <span className="text-[11.5px] text-ink-faint">
                          {action.payment.failureCategory?.replace(/_/g, " ") || "Failure"}
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
                    <TD className="text-right">
                      <div
                        className="flex items-center justify-end gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {action.status === RecoveryStatus.PENDING_APPROVAL ||
                        action.status === RecoveryStatus.RECOMMENDED ? (
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
                        ) : action.status === RecoveryStatus.APPROVED ? (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={isProcessing}
                            onClick={(e) => handleExecute(action.id, e)}
                            className="h-7 px-2.5 text-[12px]"
                          >
                            <Play className="h-3.5 w-3.5" /> Execute
                          </Button>
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
                  Action ID: {selectedAction.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedAction(null)}
                className="rounded-app p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
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
                </div>
                <div>
                  <span className="text-[11.5px] text-ink-faint">Customer</span>
                  <p className="text-[14px] font-medium text-ink">
                    {selectedAction.payment.customer.name}
                  </p>
                  <p className="text-[11.5px] text-ink-faint">{selectedAction.payment.customer.email}</p>
                </div>
              </div>

              {/* 1. AI Recommendation Box */}
              <div className="rounded-app border border-line bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                    AI Diagnosis &amp; Recommendation
                  </span>
                  <Badge tone="ai">Advisory</Badge>
                </div>

                {selectedAction.aiAnalysis ? (
                  <AiDiagnosisCard
                    diagnosis={selectedAction.aiAnalysis.diagnosis}
                    confidence={selectedAction.aiAnalysis.confidence}
                    recoveryProbability={selectedAction.aiAnalysis.recoveryProbability}
                    riskLevel={selectedAction.aiAnalysis.riskLevel}
                    recommendedAction={selectedAction.aiAnalysis.recommendedAction}
                    expectedRecoveryAmount={selectedAction.payment.amount}
                    reasoning={selectedAction.aiAnalysis.reasoning}
                    failureCategory={selectedAction.payment.failureCategory}
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
                        ? "Policy: Operator Approval Required"
                        : policyDecision.status === "AI_RECOMMENDATION_ESCALATED"
                        ? "Policy: Overridden / Escalated"
                        : "Policy: Rejected"}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Checking Policy Rules…</Badge>
                  )}
                </div>

                <div className="space-y-2 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-faint">Permitted Policy Action:</span>
                    <span className="font-semibold text-ink">
                      {policyDecision
                        ? policyDecision.policyPermittedAction.replace(/_/g, " ")
                        : selectedAction.actionType.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-ink-faint shrink-0">Policy Guidance:</span>
                    <span className="text-right font-medium text-ink-muted">
                      {policyDecision?.policyReason ||
                        "Deterministic safety policy rules govern execution."}
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

              {/* Approval History */}
              {selectedAction.approvedBy && (
                <div className="rounded-app border border-line p-3 text-[12.5px] text-ink">
                  <span className="font-semibold">Operator Sign-Off:</span> Approved by{" "}
                  <span className="font-medium text-ink">{selectedAction.approvedBy.name}</span> on{" "}
                  {selectedAction.approvedAt ? formatDateTime(selectedAction.approvedAt) : "—"}
                </div>
              )}

              {/* Attempts Timeline */}
              {selectedAction.attempts && selectedAction.attempts.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">
                    Recovery Attempt Records
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
                        <span className="text-[11px] text-ink-faint">
                          {formatDateTime(att.attemptedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Interactive Actions */}
            <div className="border-t border-line bg-surface px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedAction(null)}
                >
                  Close
                </Button>
                <div className="flex items-center gap-2">
                  {selectedAction.status === RecoveryStatus.PENDING_APPROVAL ||
                  selectedAction.status === RecoveryStatus.RECOMMENDED ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={processingId === selectedAction.id}
                        onClick={() => handleReject(selectedAction.id)}
                      >
                        Reject Action
                      </Button>
                      <Button
                        size="sm"
                        variant="recovery"
                        disabled={processingId === selectedAction.id}
                        onClick={() => handleApprove(selectedAction.id)}
                      >
                        Approve Recovery
                      </Button>
                    </>
                  ) : selectedAction.status === RecoveryStatus.APPROVED ? (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={processingId === selectedAction.id}
                      onClick={() => handleExecute(selectedAction.id)}
                    >
                      <Play className="h-3.5 w-3.5" /> Execute Workflow Now
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
