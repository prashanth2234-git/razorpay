"use client";

import * as React from "react";
import {
  History,
  ShieldCheck,
  CheckCircle2,
  Filter,
  Search,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Bot,
  User,
  Server,
  Radio,
} from "lucide-react";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR, formatDateTime, truncateId } from "@/lib/utils";
import {
  AuditLogItem,
  AuditEventType,
  ActorType,
  AuditLogsResponse,
} from "@/types/client";

export interface AuditLogsClientProps {
  initialData: AuditLogsResponse;
}

export function AuditLogsClient({ initialData }: AuditLogsClientProps) {
  const [logs, setLogs] = React.useState<AuditLogItem[]>(initialData.auditLogs || []);
  const [total, setTotal] = React.useState(initialData.total || 0);
  const [page, setPage] = React.useState(initialData.page || 1);
  const [pageSize] = React.useState(initialData.pageSize || 25);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages || 1);

  const [selectedEventType, setSelectedEventType] = React.useState<string>("ALL");
  const [selectedActorType, setSelectedActorType] = React.useState<string>("ALL");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedLog, setSelectedLog] = React.useState<AuditLogItem | null>(null);

  async function fetchLogs(
    targetPage: number = page,
    eventType: string = selectedEventType,
    actorType: string = selectedActorType,
    search: string = searchTerm
  ) {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        page: targetPage.toString(),
        pageSize: pageSize.toString(),
      });

      if (eventType !== "ALL") params.set("eventType", eventType);
      if (actorType !== "ALL") params.set("actorType", actorType);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load audit logs (${res.status})`);
      }

      const data: AuditLogsResponse = await res.json();
      setLogs(data.auditLogs || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFilterChange(newEventType: string, newActorType: string) {
    setSelectedEventType(newEventType);
    setSelectedActorType(newActorType);
    setPage(1);
    fetchLogs(1, newEventType, newActorType, searchTerm);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchLogs(1, selectedEventType, selectedActorType, searchTerm);
  }

  const getEventBadge = (type: AuditEventType) => {
    switch (type) {
      case AuditEventType.PAYMENT_FAILED:
        return <Badge tone="danger">Payment Failed</Badge>;
      case AuditEventType.AI_DIAGNOSIS_GENERATED:
        return (
          <Badge tone="ai" dot>
            AI Advisory
          </Badge>
        );
      case AuditEventType.RECOVERY_ACTION_CREATED:
        return <Badge tone="info">Policy Gate</Badge>;
      case AuditEventType.RECOVERY_ACTION_APPROVED:
        return (
          <Badge tone="recovery" dot>
            Approved (Operator)
          </Badge>
        );
      case AuditEventType.RECOVERY_ACTION_REJECTED:
        return <Badge tone="neutral">Rejected</Badge>;
      case AuditEventType.RECOVERY_ATTEMPT_STARTED:
        return <Badge tone="info">Attempt Dispatched</Badge>;
      case AuditEventType.RECOVERY_ATTEMPT_SUCCEEDED:
        return (
          <Badge tone="recovery" dot>
            Captured (Simulated)
          </Badge>
        );
      case AuditEventType.RECOVERY_ATTEMPT_FAILED:
        return <Badge tone="danger">Attempt Declined</Badge>;
      case AuditEventType.SETTINGS_UPDATED:
      case AuditEventType.MANUAL_OVERRIDE:
        return <Badge tone="neutral">{type.replace(/_/g, " ")}</Badge>;
      default:
        return <Badge tone="neutral">{type}</Badge>;
    }
  };

  const getActorIcon = (actor: ActorType) => {
    switch (actor) {
      case ActorType.AI_AGENT:
        return <Bot className="h-3.5 w-3.5 text-ai" />;
      case ActorType.USER:
        return <User className="h-3.5 w-3.5 text-recovery" />;
      case ActorType.WEBHOOK:
        return <Radio className="h-3.5 w-3.5 text-risk" />;
      case ActorType.SYSTEM:
      default:
        return <Server className="h-3.5 w-3.5 text-ink-faint" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Explainability Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-app border border-line bg-surface-raised px-4 py-3 text-[12.5px]">
        <div className="flex items-center gap-2 text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-ai shrink-0" />
          <span>
            <strong className="text-ink">Immutable Audit Trail:</strong> Every payment event, AI diagnostic recommendation, deterministic policy validation, operator approval, and simulated execution is logged and merchant-scoped.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="ai">AI Advisory</Badge>
          <span className="text-ink-faint">→</span>
          <Badge tone="neutral">Deterministic Policy</Badge>
          <span className="text-ink-faint">→</span>
          <Badge tone="recovery">Operator Approved</Badge>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-app border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-ink-faint" />

          {/* Event Type Filter */}
          <select
            value={selectedEventType}
            onChange={(e) => handleFilterChange(e.target.value, selectedActorType)}
            className="rounded-app border border-line bg-surface-raised px-2.5 py-1 text-[12px] text-ink focus:outline-none focus:ring-1 focus:ring-ai"
          >
            <option value="ALL">All Event Types</option>
            {Object.values(AuditEventType).map((evt) => (
              <option key={evt} value={evt}>
                {evt.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          {/* Actor Type Filter */}
          <select
            value={selectedActorType}
            onChange={(e) => handleFilterChange(selectedEventType, e.target.value)}
            className="rounded-app border border-line bg-surface-raised px-2.5 py-1 text-[12px] text-ink focus:outline-none focus:ring-1 focus:ring-ai"
          >
            <option value="ALL">All Actors</option>
            {Object.values(ActorType).map((act) => (
              <option key={act} value={act}>
                {act.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchLogs()}
            disabled={isLoading}
            className="h-7 px-2.5 text-[11.5px]"
            aria-label="Refresh audit logs"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin text-ai" : ""}`} />
            <span className="ml-1">Refresh</span>
          </Button>
        </div>

        {/* Free text search */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search description, pay_id…"
              className="h-7 w-56 rounded-app border border-line bg-surface-raised pl-7 pr-2.5 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-ai"
            />
          </div>
          <Button size="sm" variant="ghost" type="submit" className="h-7 px-2 text-[11.5px]">
            Search
          </Button>
        </form>
      </div>

      {/* Main Audit Log Table Panel */}
      <Panel>
        <PanelHeader>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-ai" />
            <PanelTitle>Decision &amp; Execution Audit Log</PanelTitle>
          </div>
          <span className="text-[12px] text-ink-faint">
            Showing {logs.length} of {total.toLocaleString("en-IN")} events
          </span>
        </PanelHeader>

        {isLoading ? (
          <PanelBody className="py-16 text-center text-ink-faint">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-ai" />
            <p className="mt-3 text-[13.5px] text-ink-muted">Loading audit records…</p>
          </PanelBody>
        ) : logs.length === 0 ? (
          <PanelBody className="py-16 text-center text-ink-muted">
            <CheckCircle2 className="mx-auto h-8 w-8 text-recovery" />
            <p className="mt-2 text-[14px] font-semibold text-ink">No audit logs found</p>
            <p className="text-[12.5px] text-ink-muted">
              No audit events match your selected filters.
            </p>
          </PanelBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Timestamp</TH>
                <TH>Event</TH>
                <TH>Actor</TH>
                <TH>Description</TH>
                <TH>Payment / Action</TH>
                <TH className="text-right">Context Amount</TH>
              </TR>
            </THead>
            <TBody>
              {logs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                const paymentId = log.payment?.providerPaymentId || log.paymentId;
                const amount = log.payment?.amount;

                return (
                  <TR
                    key={log.id}
                    clickable
                    onClick={() => setSelectedLog(log)}
                    className={isSelected ? "bg-surface" : "hover:bg-surface/80"}
                  >
                    <TD className="tabular text-[12px] text-ink-faint whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </TD>
                    <TD>{getEventBadge(log.eventType)}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        {getActorIcon(log.actorType)}
                        <span className="text-[12px] font-medium text-ink">
                          {log.user?.name || log.actorType.replace(/_/g, " ")}
                        </span>
                      </div>
                    </TD>
                    <TD className="max-w-md">
                      <p className="line-clamp-2 text-[12.5px] text-ink">
                        {log.description}
                      </p>
                    </TD>
                    <TD className="tabular text-[12px] text-ink-muted whitespace-nowrap">
                      {paymentId ? truncateId(paymentId, 16) : "—"}
                    </TD>
                    <TD className="tabular text-right font-medium text-ink">
                      {amount ? formatINR(amount) : "—"}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-6 py-3 text-[12.5px]">
            <span className="text-ink-faint">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || isLoading}
                onClick={() => {
                  const newPage = page - 1;
                  setPage(newPage);
                  fetchLogs(newPage);
                }}
                className="h-7 px-2"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || isLoading}
                onClick={() => {
                  const newPage = page + 1;
                  setPage(newPage);
                  fetchLogs(newPage);
                }}
                className="h-7 px-2"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* Audit Detail Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-lg flex-col bg-surface-raised shadow-2xl overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-ink">Audit Event Details</h3>
                  {getEventBadge(selectedLog.eventType)}
                </div>
                <p className="tabular mt-0.5 text-[12px] text-ink-faint">
                  Log ID: {selectedLog.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-app p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
                aria-label="Close audit detail"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 space-y-5 p-6 text-[12.5px]">
              {/* Event Description */}
              <div className="rounded-app border border-line bg-surface p-4">
                <span className="text-[11.5px] text-ink-faint">Event Description</span>
                <p className="mt-1 text-[13.5px] font-medium text-ink leading-relaxed">
                  {selectedLog.description}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-[11.5px] text-ink-faint">
                  <span>Recorded At:</span>
                  <span className="font-medium text-ink tabular">
                    {formatDateTime(selectedLog.createdAt)}
                  </span>
                </div>
              </div>

              {/* Actor & Authority Breakdown */}
              <div className="rounded-app border border-line bg-surface p-4 space-y-2.5">
                <h4 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                  Actor &amp; Authority
                </h4>
                <div className="flex items-center justify-between">
                  <span className="text-ink-faint">Actor Classification:</span>
                  <div className="flex items-center gap-1 font-medium text-ink">
                    {getActorIcon(selectedLog.actorType)}
                    <span>{selectedLog.actorType}</span>
                  </div>
                </div>

                {selectedLog.user && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-faint">Authenticated User:</span>
                    <span className="font-medium text-ink">
                      {selectedLog.user.name} ({selectedLog.user.role})
                    </span>
                  </div>
                )}
              </div>

              {/* Related Payment Context */}
              {selectedLog.payment && (
                <div className="rounded-app border border-line bg-surface p-4 space-y-2.5">
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                    Payment Context
                  </h4>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-faint">Payment ID:</span>
                    <span className="font-mono text-ink">
                      {selectedLog.payment.providerPaymentId || selectedLog.payment.id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-faint">Payment Amount:</span>
                    <span className="font-semibold text-ink tabular">
                      {formatINR(selectedLog.payment.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-faint">Payment Status:</span>
                    <Badge tone="neutral">{selectedLog.payment.status}</Badge>
                  </div>
                  {selectedLog.payment.customer && (
                    <div className="flex items-center justify-between">
                      <span className="text-ink-faint">Customer:</span>
                      <span className="font-medium text-ink">
                        {selectedLog.payment.customer.name}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Safe Metadata JSON Inspector */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[12px] font-semibold uppercase tracking-wider text-ink-faint">
                    Structured Audit Metadata (Sanitized)
                  </h4>
                  <pre className="max-h-60 overflow-auto rounded-app border border-line bg-surface p-3 font-mono text-[11px] text-ink leading-relaxed">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-line bg-surface px-6 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="w-full"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
