"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  CreditCard,
  Smartphone,
  Landmark,
  Wallet,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { AiDiagnosisCard } from "@/components/recovery/ai-diagnosis-card";
import { formatINR, formatDateTime, truncateId } from "@/lib/utils";
import { PaymentStatus, PaymentMethod, FailureCategory } from "@prisma/client";

export interface PaymentRecord {
  id: string;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  failureCategory: FailureCategory | null;
  description: string | null;
  createdAt: string | Date;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  aiAnalyses?: Array<{
    id: string;
    diagnosis: string;
    confidence: number;
    recoveryProbability: number;
    recommendedAction: string;
    riskLevel: string;
    reasoning?: string;
    modelName?: string;
    source?: "claude" | "seeded" | "deterministic_fallback";
  }>;
  recoveryActions?: Array<{
    id: string;
    actionType: string;
    status: string;
    expectedRecoveryAmount: number | null;
  }>;
}

interface DetailedPaymentRecord extends PaymentRecord {
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    lifetimeValue: number;
    successfulPaymentCount: number;
  };
  attempts?: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    providerResponseMessage: string | null;
    providerResponseCode: string | null;
    attemptedAt: string | Date;
  }>;
  auditLogs?: Array<{
    id: string;
    eventType: string;
    description: string;
    createdAt: string | Date;
  }>;
}

interface PaymentsClientProps {
  initialPayments: PaymentRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  currentStatus?: string;
  currentMethod?: string;
  currentSearch?: string;
}

export function PaymentsClient({
  initialPayments,
  total,
  page,
  pageSize,
  totalPages,
  currentStatus = "",
  currentMethod = "",
  currentSearch = "",
}: PaymentsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(currentSearch);
  const [selectedPayment, setSelectedPayment] = React.useState<PaymentRecord | null>(null);
  const [fullPaymentDetail, setFullPaymentDetail] = React.useState<DetailedPaymentRecord | null>(null);

  // Live Claude AI analysis state
  const [analyzingWithAi, setAnalyzingWithAi] = React.useState(false);
  const [aiAnalysisError, setAiAnalysisError] = React.useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = React.useState<{
    diagnosis: string;
    confidence: number;
    recoveryProbability: number;
    recommendedAction: string;
    riskLevel: string;
    reasoning: string;
    modelName: string;
    source: "claude" | "seeded" | "deterministic_fallback";
  } | null>(null);

  function updateQuery(params: Record<string, string | null>) {
    const current = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === "") {
        current.delete(key);
      } else {
        current.set(key, value);
      }
    });
    router.push(`/dashboard/payments?${current.toString()}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateQuery({ search, page: "1" });
  }

  async function handleRowClick(payment: PaymentRecord) {
    setSelectedPayment(payment);
    setFullPaymentDetail(null);
    setAiAnalysisError(null);

    // Set initial active analysis from payment record if present
    if (payment.aiAnalyses && payment.aiAnalyses[0]) {
      const initAi = payment.aiAnalyses[0];
      setActiveAnalysis({
        diagnosis: initAi.diagnosis,
        confidence: initAi.confidence,
        recoveryProbability: initAi.recoveryProbability,
        recommendedAction: initAi.recommendedAction,
        riskLevel: initAi.riskLevel,
        reasoning: initAi.reasoning || initAi.diagnosis,
        modelName: initAi.modelName || "claude-3-7-sonnet",
        source: initAi.source || "seeded",
      });
    } else {
      setActiveAnalysis(null);
    }

    try {
      const res = await fetch(`/api/payments/${payment.id}`);
      if (res.ok) {
        const data = await res.json();
        setFullPaymentDetail(data);

        // If full payment detail has richer reasoning
        if (data.aiAnalyses && data.aiAnalyses[0]) {
          const detailAi = data.aiAnalyses[0];
          setActiveAnalysis((prev) => ({
            diagnosis: detailAi.diagnosis,
            confidence: detailAi.confidence,
            recoveryProbability: detailAi.recoveryProbability,
            recommendedAction: detailAi.recommendedAction,
            riskLevel: detailAi.riskLevel,
            reasoning: detailAi.reasoning || detailAi.diagnosis,
            modelName: detailAi.modelName || "claude-3-7-sonnet",
            source: prev?.source === "claude" ? "claude" : "seeded",
          }));
        }
      }
    } catch (err) {
      console.error("Failed to fetch payment details:", err);
    }
  }

  async function handleAnalyzeWithAi() {
    if (!selectedPayment) return;

    setAnalyzingWithAi(true);
    setAiAnalysisError(null);

    try {
      const res = await fetch(`/api/payments/${selectedPayment.id}/ai-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Claude analysis request failed");
      }

      // Update active analysis with live Claude response
      const liveAi = data.analysis;
      setActiveAnalysis({
        diagnosis: liveAi.diagnosis,
        confidence: liveAi.confidence,
        recoveryProbability: liveAi.recoveryProbability,
        recommendedAction: liveAi.recommendedAction,
        riskLevel: liveAi.riskLevel,
        reasoning: liveAi.reasoning,
        modelName: data.model || liveAi.modelName || "claude-3-7-sonnet",
        source: "claude",
      });

      // Refetch payment detail in background to update audit logs
      try {
        const refreshRes = await fetch(`/api/payments/${selectedPayment.id}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setFullPaymentDetail(refreshData);
        }
      } catch {
        // Ignore background refresh errors
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to run Claude AI diagnosis.";
      setAiAnalysisError(msg);
    } finally {
      setAnalyzingWithAi(false);
    }
  }

  const getStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case PaymentStatus.SUCCESS:
        return <Badge tone="recovery">Success</Badge>;
      case PaymentStatus.RECOVERED:
        return <Badge tone="recovery" dot>Recovered</Badge>;
      case PaymentStatus.FAILED:
        return <Badge tone="danger">Failed</Badge>;
      case PaymentStatus.RECOVERY_PENDING:
        return <Badge tone="ai" dot>Recovery Pending</Badge>;
      case PaymentStatus.ESCALATED:
        return <Badge tone="risk">Escalated</Badge>;
      case PaymentStatus.PROCESSING:
        return <Badge tone="info">Processing</Badge>;
      default:
        return <Badge tone="neutral">{status}</Badge>;
    }
  };

  const getMethodIcon = (method: PaymentMethod) => {
    switch (method) {
      case PaymentMethod.UPI:
        return <Smartphone className="h-3.5 w-3.5 text-ai" />;
      case PaymentMethod.CARD:
        return <CreditCard className="h-3.5 w-3.5 text-info" />;
      case PaymentMethod.NETBANKING:
        return <Landmark className="h-3.5 w-3.5 text-ink-muted" />;
      case PaymentMethod.WALLET:
        return <Wallet className="h-3.5 w-3.5 text-recovery" />;
      default:
        return <CreditCard className="h-3.5 w-3.5 text-ink-faint" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <Panel className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              type="search"
              placeholder="Search by payment ID, customer, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Filter */}
            <Select
              value={currentStatus}
              onChange={(e) => updateQuery({ status: e.target.value, page: "1" })}
              className="text-[13px]"
            >
              <option value="">All Statuses</option>
              <option value="FAILED">Failed</option>
              <option value="RECOVERED">Recovered</option>
              <option value="RECOVERY_PENDING">Recovery Pending</option>
              <option value="SUCCESS">Success</option>
              <option value="ESCALATED">Escalated</option>
            </Select>

            {/* Method Filter */}
            <Select
              value={currentMethod}
              onChange={(e) => updateQuery({ method: e.target.value, page: "1" })}
              className="text-[13px]"
            >
              <option value="">All Methods</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="NETBANKING">Netbanking</option>
              <option value="WALLET">Wallet</option>
              <option value="EMI">EMI</option>
            </Select>

            {(currentStatus || currentMethod || currentSearch) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  router.push("/dashboard/payments");
                }}
                className="text-[12px] text-danger"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </Panel>

      {/* Main Payment Table */}
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-ink">Payment Events</span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-[12px] text-ink-muted">
              {total.toLocaleString("en-IN")} total
            </span>
          </div>
          <span className="text-[12px] text-ink-faint">
            Page {page} of {totalPages || 1}
          </span>
        </div>

        {initialPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-ink-muted">
            <AlertTriangle className="h-8 w-8 text-ink-faint" />
            <p className="mt-3 text-[14px] font-medium text-ink">No payments match your filters</p>
            <p className="text-[12.5px] text-ink-muted">Try adjusting your search criteria or resetting filters.</p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Payment ID</TH>
                <TH>Customer</TH>
                <TH>Amount</TH>
                <TH>Method</TH>
                <TH>Status</TH>
                <TH>Failure Category</TH>
                <TH>Recovery Odds</TH>
                <TH>Recommended Action</TH>
                <TH>Date &amp; Time</TH>
              </TR>
            </THead>
            <TBody>
              {initialPayments.map((p) => {
                const ai = p.aiAnalyses?.[0];
                return (
                  <TR
                    key={p.id}
                    clickable
                    onClick={() => handleRowClick(p)}
                    className="hover:bg-surface/80"
                  >
                    <TD className="tabular font-medium text-ink">
                      {truncateId(p.providerPaymentId || p.id, 16)}
                    </TD>
                    <TD>
                      <div className="flex flex-col">
                        <span className="font-medium text-ink">{p.customer.name}</span>
                        <span className="text-[11.5px] text-ink-faint">{p.customer.email}</span>
                      </div>
                    </TD>
                    <TD className="tabular font-semibold text-ink">
                      {formatINR(p.amount)}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5 text-[12.5px] text-ink">
                        {getMethodIcon(p.method)}
                        <span>{p.method}</span>
                      </div>
                    </TD>
                    <TD>{getStatusBadge(p.status)}</TD>
                    <TD>
                      {p.failureCategory ? (
                        <Badge tone="risk">
                          {p.failureCategory.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-ink-faint">—</span>
                      )}
                    </TD>
                    <TD className="tabular">
                      {ai ? (
                        <span
                          className={`font-semibold ${
                            ai.recoveryProbability >= 0.7
                              ? "text-recovery"
                              : ai.recoveryProbability >= 0.4
                              ? "text-risk"
                              : "text-danger"
                          }`}
                        >
                          {(ai.recoveryProbability * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-[12px] text-ink-faint">—</span>
                      )}
                    </TD>
                    <TD>
                      {ai ? (
                        <Badge
                          tone={
                            ai.recommendedAction === "RETRY_PAYMENT"
                              ? "recovery"
                              : ai.recommendedAction === "SEND_REMINDER"
                              ? "ai"
                              : "info"
                          }
                        >
                          {ai.recommendedAction.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-ink-faint">—</span>
                      )}
                    </TD>
                    <TD className="text-[12px] text-ink-muted">
                      {formatDateTime(p.createdAt)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
            <div className="text-[12.5px] text-ink-muted">
              Showing {(page - 1) * pageSize + 1} to{" "}
              {Math.min(page * pageSize, total)} of {total} payments
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateQuery({ page: String(page - 1) })}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-[12.5px] font-medium text-ink px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateQuery({ page: String(page + 1) })}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* Payment Investigation Drawer */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-xl flex-col bg-surface-raised shadow-2xl overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold text-ink">Payment Investigation</h3>
                  {getStatusBadge(selectedPayment.status)}
                </div>
                <p className="tabular mt-0.5 text-[12.5px] text-ink-faint">
                  {selectedPayment.providerPaymentId || selectedPayment.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedPayment(null)}
                className="rounded-app p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 space-y-5 p-6">
              {/* Analysis Error Alert */}
              {aiAnalysisError && (
                <div className="flex items-center justify-between rounded-app border border-danger/30 bg-danger-soft p-3 text-[12.5px] text-danger">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{aiAnalysisError}</span>
                  </div>
                  <button
                    onClick={() => setAiAnalysisError(null)}
                    className="text-danger hover:opacity-70"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Payment Summary Box */}
              <div className="grid grid-cols-2 gap-3 rounded-app border border-line bg-surface p-4">
                <div>
                  <span className="text-[11.5px] text-ink-faint">Order Amount</span>
                  <p className="tabular text-[20px] font-semibold text-ink">
                    {formatINR(selectedPayment.amount)}
                  </p>
                </div>
                <div>
                  <span className="text-[11.5px] text-ink-faint">Payment Method</span>
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    {getMethodIcon(selectedPayment.method)}
                    <span>{selectedPayment.method}</span>
                  </div>
                </div>
                <div className="col-span-2 border-t border-line/60 pt-2">
                  <span className="text-[11.5px] text-ink-faint">Description</span>
                  <p className="text-[13px] text-ink-muted">
                    {selectedPayment.description || "General invoice item"}
                  </p>
                </div>
              </div>

              {/* Customer Context */}
              <div className="rounded-app border border-line p-4">
                <h4 className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  Customer Profile
                </h4>
                <div className="mt-2.5 flex items-start justify-between">
                  <div>
                    <p className="text-[14px] font-semibold text-ink">
                      {selectedPayment.customer.name}
                    </p>
                    <p className="text-[12.5px] text-ink-muted">{selectedPayment.customer.email}</p>
                    {selectedPayment.customer.phone && (
                      <p className="text-[12px] text-ink-faint">{selectedPayment.customer.phone}</p>
                    )}
                  </div>
                  {fullPaymentDetail?.customer && (
                    <div className="text-right">
                      <span className="text-[11.5px] text-ink-faint">Customer LTV</span>
                      <p className="tabular text-[14px] font-semibold text-recovery">
                        {formatINR(fullPaymentDetail.customer.lifetimeValue)}
                      </p>
                      <p className="text-[11px] text-ink-faint">
                        {fullPaymentDetail.customer.successfulPaymentCount} successful payments
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Diagnosis Card */}
              {activeAnalysis ? (
                <AiDiagnosisCard
                  diagnosis={activeAnalysis.diagnosis}
                  confidence={activeAnalysis.confidence}
                  recoveryProbability={activeAnalysis.recoveryProbability}
                  riskLevel={activeAnalysis.riskLevel}
                  recommendedAction={activeAnalysis.recommendedAction}
                  expectedRecoveryAmount={selectedPayment.amount}
                  reasoning={activeAnalysis.reasoning}
                  failureCategory={selectedPayment.failureCategory}
                  modelName={activeAnalysis.modelName}
                  source={activeAnalysis.source}
                  canAnalyze={selectedPayment.status !== PaymentStatus.SUCCESS}
                  isAnalyzing={analyzingWithAi}
                  onAnalyzeWithAi={handleAnalyzeWithAi}
                />
              ) : selectedPayment.status === PaymentStatus.SUCCESS ? (
                <div className="flex items-center gap-3 rounded-app border border-recovery/30 bg-recovery-soft/40 p-4 text-recovery">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold">Payment Completed Successfully</p>
                    <p className="text-[12px] opacity-80">
                      Funds were verified and captured on the initial transaction attempt.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-app border border-line bg-surface p-6 text-center">
                  <Sparkles className="h-6 w-6 text-ai" />
                  <p className="mt-2 text-[13px] font-semibold text-ink">No AI diagnosis on record</p>
                  <p className="text-[12px] text-ink-muted">Run Claude diagnosis to analyze recovery odds and recommended action.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={analyzingWithAi}
                    onClick={handleAnalyzeWithAi}
                    className="mt-3 gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-ai" />
                    {analyzingWithAi ? "Analyzing with Claude…" : "Analyze with Claude AI"}
                  </Button>
                </div>
              )}

              {/* Failure & Attempt Timeline */}
              {fullPaymentDetail && fullPaymentDetail.attempts && fullPaymentDetail.attempts.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">
                    Execution Timeline
                  </h4>
                  <div className="space-y-2 border-l-2 border-line pl-4">
                    {fullPaymentDetail.attempts.map((att) => (
                      <div key={att.id} className="relative pb-2">
                        <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-ink-faint" />
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="font-semibold text-ink">
                            Attempt #{att.attemptNumber}: {att.status}
                          </span>
                          <span className="text-ink-faint">{formatDateTime(att.attemptedAt)}</span>
                        </div>
                        {att.providerResponseMessage && (
                          <p className="mt-0.5 text-[12px] text-danger">
                            {att.providerResponseMessage} (Code: {att.providerResponseCode})
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit Logs Trail */}
              {fullPaymentDetail?.auditLogs && fullPaymentDetail.auditLogs.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[12.5px] font-semibold uppercase tracking-wider text-ink-faint">
                    Audit Log Trail
                  </h4>
                  <div className="space-y-1.5 rounded-app border border-line bg-surface p-3 text-[12px]">
                    {fullPaymentDetail.auditLogs.map((log) => (
                      <div key={log.id} className="flex items-start justify-between gap-2 border-b border-line/40 pb-1.5 last:border-0 last:pb-0">
                        <div>
                          <span className="font-semibold text-ink">[{log.eventType}]</span>{" "}
                          <span className="text-ink-muted">{log.description}</span>
                        </div>
                        <span className="shrink-0 text-[11px] text-ink-faint">
                          {formatDateTime(log.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-line bg-surface px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPayment(null)}
                >
                  Close
                </Button>
                {selectedPayment.status === PaymentStatus.FAILED ||
                selectedPayment.status === PaymentStatus.RECOVERY_PENDING ? (
                  <Button
                    size="sm"
                    variant="recovery"
                    onClick={() => router.push("/dashboard/recovery")}
                  >
                    View in Recovery Queue <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
