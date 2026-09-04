"use client";

import * as React from "react";
import {
  TrendingUp,
  RefreshCw,
  Info,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Zap,
} from "lucide-react";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat, StatRow } from "@/components/ui/stat";
import { formatINR } from "@/lib/utils";
import {
  RecoveryAnalyticsData,
  FailureCategory,
} from "@/types/client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export type TimeRangeOption = "7d" | "30d" | "90d" | "all";

export interface AnalyticsClientProps {
  initialData: RecoveryAnalyticsData;
}

const emptySubscribe = () => () => {};

export function AnalyticsClient({ initialData }: AnalyticsClientProps) {
  const [data, setData] = React.useState<RecoveryAnalyticsData>(initialData);
  const [timeRange, setTimeRange] = React.useState<TimeRangeOption>("30d");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("ALL");
  const [isLoading, setIsLoading] = React.useState(false);

  const isMounted = React.useSyncExternalStore(emptySubscribe, () => true, () => false);

  async function fetchAnalytics(
    range: TimeRangeOption = timeRange,
    category: string = selectedCategory
  ) {
    setIsLoading(true);

    try {
      const now = new Date();
      let startDate: string | undefined;

      if (range === "7d") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (range === "30d") {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (range === "90d") {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      }

      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (category !== "ALL") params.set("failureCategory", category);

      const res = await fetch(`/api/analytics/recovery?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load analytics (${res.status})`);
      }

      const freshData = await res.json();
      setData(freshData);
    } catch (err) {
      console.error("Error fetching analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleRangeChange(newRange: TimeRangeOption) {
    setTimeRange(newRange);
    fetchAnalytics(newRange, selectedCategory);
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newCat = e.target.value;
    setSelectedCategory(newCat);
    fetchAnalytics(timeRange, newCat);
  }

  // Format trend data for Recharts (convert paise to rupees for readable chart axes)
  const chartData = React.useMemo(() => {
    return data.trend.map((point) => ({
      date: point.date.slice(5), // MM-DD
      "Revenue at Risk (₹)": Math.round(point.revenueAtRisk / 100),
      "Expected Recoverable (₹)": Math.round(point.expectedRecoverable / 100),
      "Recovered Revenue (₹)": Math.round(point.recoveredRevenue / 100),
      recoveries: point.successfulRecoveries,
    }));
  }, [data.trend]);

  return (
    <div className="space-y-6">
      {/* Simulation Notice Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-app border border-line bg-surface-raised px-4 py-2.5 text-[12.5px]">
        <div className="flex items-center gap-2 text-ink-muted">
          <Info className="h-4 w-4 text-ai shrink-0" />
          <span>
            <strong className="text-ink">Simulated Recovery Analytics:</strong> Recovered revenue and workflow statistics reflect automated recovery orchestrations via MockRecoveryProvider in safe sandbox simulation mode. No real money was moved.
          </span>
        </div>
        <Badge tone="recovery" dot>
          Sandbox Analytics Active
        </Badge>
      </div>

      {/* Filter & Range Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-app border border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-ink-faint" />
          <div className="flex items-center gap-1 rounded-app bg-surface-raised p-0.5 border border-line">
            {(
              [
                { key: "7d", label: "7 Days" },
                { key: "30d", label: "30 Days" },
                { key: "90d", label: "90 Days" },
                { key: "all", label: "All Time" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleRangeChange(tab.key)}
                className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  timeRange === tab.key
                    ? "bg-ink text-paper shadow-xs"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-ink-faint" />
          <select
            value={selectedCategory}
            onChange={handleCategoryChange}
            className="rounded-app border border-line bg-surface-raised px-2.5 py-1 text-[12px] text-ink focus:outline-none focus:ring-1 focus:ring-ai"
          >
            <option value="ALL">All Failure Categories</option>
            {Object.values(FailureCategory).map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchAnalytics()}
            disabled={isLoading}
            className="h-7 px-2.5 text-[11.5px]"
            aria-label="Refresh recovery analytics"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin text-ai" : ""}`} />
            <span className="ml-1">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Top Financial KPI Row */}
      <StatRow>
        <Stat
          label="Revenue at Risk"
          value={formatINR(data.revenueAtRisk)}
          delta={12.4}
        />
        <Stat
          label="Expected Recoverable"
          value={formatINR(data.expectedRecoverable)}
          delta={15.8}
        />
        <Stat
          label="Recovered Revenue (Simulated)"
          value={formatINR(data.recoveredRevenue)}
          delta={21.3}
        />
        <Stat
          label="Revenue Recovery Rate"
          value={`${data.recoveryRate}%`}
          subtitle="₹ recovered vs ₹ at risk"
          delta={4.2}
        />
        <Stat
          label="Active Recovery Pipeline"
          value={data.recoveryPipelineCount.toLocaleString("en-IN")}
          delta={6.1}
        />
        <Stat
          label="Avg Recovered / Workflow"
          value={formatINR(data.averageRecoveredAmount)}
          delta={8.7}
        />
      </StatRow>

      {/* Secondary Execution KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-app border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-ink-faint">Recovery Attempts</span>
            <Zap className="h-4 w-4 text-ai" />
          </div>
          <p className="tabular mt-2 text-[22px] font-semibold text-ink">
            {data.totalRecoveryAttempts.toLocaleString("en-IN")}
          </p>
          <span className="text-[11.5px] text-ink-muted">Dispatched across all routes</span>
        </div>

        <div className="rounded-app border border-recovery/30 bg-recovery-soft/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-ink-faint">Successful Recoveries</span>
            <CheckCircle2 className="h-4 w-4 text-recovery" />
          </div>
          <p className="tabular mt-2 text-[22px] font-semibold text-recovery">
            {data.successfulRecoveries.toLocaleString("en-IN")}
          </p>
          <span className="text-[11.5px] text-ink-muted">Executed and captured</span>
        </div>

        <div className="rounded-app border border-danger/30 bg-danger-soft/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-ink-faint">Failed Retries</span>
            <AlertTriangle className="h-4 w-4 text-danger" />
          </div>
          <p className="tabular mt-2 text-[22px] font-semibold text-danger">
            {data.failedRecoveries.toLocaleString("en-IN")}
          </p>
          <span className="text-[11.5px] text-ink-muted">Issuer declined / exhausted</span>
        </div>

        <div className="rounded-app border border-risk/30 bg-risk-soft/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-ink-faint">Pending Human Approval</span>
            <Clock className="h-4 w-4 text-risk" />
          </div>
          <p className="tabular mt-2 text-[22px] font-semibold text-risk">
            {data.pendingApprovalCount.toLocaleString("en-IN")}
          </p>
          <span className="text-[11.5px] text-ink-muted">Awaiting operator review</span>
        </div>
      </div>

      {/* Main Recovery Trend Visualizer */}
      <Panel>
        <PanelHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-ai" />
            <PanelTitle>Recovery Performance Over Time</PanelTitle>
          </div>
          <Badge tone="ai" dot>
            Dynamic Timeseries
          </Badge>
        </PanelHeader>
        <PanelBody className="p-6">
          <div className="h-72 w-full">
            {isMounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorRecovered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `₹${v.toLocaleString("en-IN")}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                    formatter={(value: unknown) => [
                      `₹${Number(value || 0).toLocaleString("en-IN")}`,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  <Area
                    type="monotone"
                    dataKey="Revenue at Risk (₹)"
                    stroke="#f59e0b"
                    fillOpacity={1}
                    fill="url(#colorRisk)"
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="Expected Recoverable (₹)"
                    stroke="#6366f1"
                    fillOpacity={1}
                    fill="url(#colorExpected)"
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="Recovered Revenue (₹)"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorRecovered)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-ink-faint text-[13px]">
                Loading trend visualization…
              </div>
            )}
          </div>
        </PanelBody>
      </Panel>

      {/* Two Column Grid: Failure Category vs Intervention Action */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recovery by Failure Category Table */}
        <Panel>
          <PanelHeader>
            <PanelTitle>Recovery by Failure Category</PanelTitle>
            <span className="text-[11.5px] text-ink-faint">
              {data.byCategory.length} Categories Detected
            </span>
          </PanelHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Category</TH>
                  <TH className="text-right">Opportunities</TH>
                  <TH className="text-right">At Risk</TH>
                  <TH className="text-right">Recovered</TH>
                  <TH className="text-right">Rate</TH>
                </TR>
              </THead>
              <TBody>
                {data.byCategory.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="py-6 text-center text-ink-muted">
                      No failure category data found for this period.
                    </TD>
                  </TR>
                ) : (
                  data.byCategory.map((cat) => (
                    <TR key={cat.category}>
                      <TD className="font-medium text-ink">
                        {cat.category.replace(/_/g, " ")}
                      </TD>
                      <TD className="tabular text-right text-ink-muted">
                        {cat.opportunities}
                      </TD>
                      <TD className="tabular text-right text-ink">
                        {formatINR(cat.revenueAtRisk)}
                      </TD>
                      <TD className="tabular text-right font-medium text-recovery">
                        {formatINR(cat.recoveredRevenue)}
                      </TD>
                      <TD className="tabular text-right">
                        <span
                          className={
                            cat.recoveryRate >= 70
                              ? "font-semibold text-recovery"
                              : cat.recoveryRate >= 40
                              ? "text-risk"
                              : "text-ink-muted"
                          }
                        >
                          {cat.recoveryRate}%
                        </span>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </Panel>

        {/* Recovery by Action Type Table */}
        <Panel>
          <PanelHeader>
            <PanelTitle>Recovery by Action Type</PanelTitle>
            <span className="text-[11.5px] text-ink-faint">Intervention Breakdown</span>
          </PanelHeader>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Intervention Route</TH>
                  <TH className="text-right">Actions</TH>
                  <TH className="text-right">Success</TH>
                  <TH className="text-right">Failed</TH>
                  <TH className="text-right">Recovered</TH>
                </TR>
              </THead>
              <TBody>
                {data.byActionType.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="py-6 text-center text-ink-muted">
                      No recovery action data found for this period.
                    </TD>
                  </TR>
                ) : (
                  data.byActionType.map((act) => (
                    <TR key={act.actionType}>
                      <TD className="font-medium text-ink">
                        <Badge
                          tone={
                            act.actionType === "RETRY_PAYMENT"
                              ? "recovery"
                              : act.actionType === "SEND_REMINDER"
                              ? "ai"
                              : "info"
                          }
                        >
                          {act.actionType.replace(/_/g, " ")}
                        </Badge>
                      </TD>
                      <TD className="tabular text-right text-ink-muted">
                        {act.opportunities}
                      </TD>
                      <TD className="tabular text-right text-recovery font-medium">
                        {act.executed}
                      </TD>
                      <TD className="tabular text-right text-danger">
                        {act.failed}
                      </TD>
                      <TD className="tabular text-right font-medium text-recovery">
                        {formatINR(act.recoveredRevenue)}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>
        </Panel>
      </div>

      {/* AI & Deterministic Policy Safety Funnel */}
      <Panel>
        <PanelHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ai" />
            <PanelTitle>AI Diagnosis &amp; Deterministic Policy Safety Funnel</PanelTitle>
          </div>
          <Badge tone="ai">Deterministic Governance</Badge>
        </PanelHeader>
        <PanelBody className="p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-app border border-line bg-surface p-3 text-center">
              <span className="text-[11.5px] text-ink-faint">AI Diagnoses</span>
              <p className="tabular mt-1 text-[18px] font-semibold text-ink">
                {data.aiPolicy.aiRecommendationsCount.toLocaleString("en-IN")}
              </p>
              <span className="text-[10.5px] text-ink-muted">Advisory recommendations</span>
            </div>

            <div className="rounded-app border border-line bg-surface p-3 text-center">
              <span className="text-[11.5px] text-ink-faint">Avg Confidence</span>
              <p className="tabular mt-1 text-[18px] font-semibold text-ai">
                {(data.aiPolicy.avgConfidence * 100).toFixed(0)}%
              </p>
              <span className="text-[10.5px] text-ink-muted">Model diagnostic certainty</span>
            </div>

            <div className="rounded-app border border-line bg-surface p-3 text-center">
              <span className="text-[11.5px] text-ink-faint">Avg Recovery Probability</span>
              <p className="tabular mt-1 text-[18px] font-semibold text-recovery">
                {(data.aiPolicy.avgRecoveryProbability * 100).toFixed(0)}%
              </p>
              <span className="text-[10.5px] text-ink-muted">Estimated success odds</span>
            </div>

            <div className="rounded-app border border-recovery/30 bg-recovery-soft/30 p-3 text-center">
              <span className="text-[11.5px] text-ink-faint">Policy Accepted</span>
              <p className="tabular mt-1 text-[18px] font-semibold text-recovery">
                {data.aiPolicy.policyAcceptedCount.toLocaleString("en-IN")}
              </p>
              <span className="text-[10.5px] text-ink-muted">Approved &amp; Executed</span>
            </div>

            <div className="rounded-app border border-risk/30 bg-risk-soft/30 p-3 text-center">
              <span className="text-[11.5px] text-ink-faint">Approval Required</span>
              <p className="tabular mt-1 text-[18px] font-semibold text-risk">
                {data.aiPolicy.approvalRequiredCount.toLocaleString("en-IN")}
              </p>
              <span className="text-[10.5px] text-ink-muted">Operator intervention</span>
            </div>

            <div className="rounded-app border border-neutral/30 bg-surface-raised p-3 text-center">
              <span className="text-[11.5px] text-ink-faint">Policy Rejected</span>
              <p className="tabular mt-1 text-[18px] font-semibold text-ink-muted">
                {data.aiPolicy.policyRejectedCount.toLocaleString("en-IN")}
              </p>
              <span className="text-[10.5px] text-ink-muted">Gated by safety rules</span>
            </div>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
