import Link from "next/link";
import { getCurrentUser } from "@/server/auth";
import {
  getDashboardSummary,
  getRecentAiDecisions,
  DashboardSummary,
  RecentAiDecision,
} from "@/server/services/analyticsService";
import { getRecoveryAnalytics } from "@/server/analytics/recovery-analytics";
import { DashboardTrendChart } from "@/app/dashboard/dashboard-trend-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody, PanelHeader, PanelTitle, PanelDescription } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatINR, formatPercent, formatDateTime, truncateId } from "@/lib/utils";
import {
  AlertTriangle,
  Database,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Zap,
  Bot,
  Activity,
  CheckCircle2,
  Lock,
  Sparkles,
  Clock,
  ArrowUpRight,
  Workflow,
  ChevronRight,
} from "lucide-react";

export default async function OverviewPage() {
  const user = await getCurrentUser();
  const merchantId = user?.merchantId || "merch_kaveri_demo_01";

  let summary: DashboardSummary | null = null;
  let analytics: Awaited<ReturnType<typeof getRecoveryAnalytics>> | null = null;
  let recentDecisions: RecentAiDecision[] = [];
  let dbError: string | null = null;

  try {
    const [sum, anal, decisions] = await Promise.all([
      getDashboardSummary(merchantId),
      getRecoveryAnalytics(merchantId),
      getRecentAiDecisions(merchantId, 6),
    ]);
    summary = sum;
    analytics = anal;
    recentDecisions = decisions;
  } catch (error) {
    console.error("Failed to load dashboard metrics from PostgreSQL:", error);
    dbError = error instanceof Error ? error.message : "Database connection unavailable";
  }

  if (dbError || !summary || !analytics) {
    return (
      <>
        <PageHeader
          title="Revenue Recovery Command Center"
          description="AI-assisted recovery of failed payments, governed by deterministic policy and human oversight."
        />
        <Panel className="border-rose-200 bg-rose-50/40 p-8 shadow-sm">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 shadow-xs">
              <Database className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-[16px] font-bold text-ink">
              PostgreSQL Database Offline
            </h2>
            <p className="mt-2 max-w-lg text-[13px] text-ink-muted leading-relaxed">
              The application could not connect to PostgreSQL on <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink font-semibold">localhost:5432</code>.
            </p>
            <div className="mt-6 w-full max-w-md rounded-app border border-line bg-surface-raised p-4 text-left font-mono text-[12px] text-ink shadow-xs">
              <p className="font-sans font-semibold text-ink-muted">To start PostgreSQL and seed demo data:</p>
              <pre className="mt-2 text-ink-muted">
                <code>
                  # If using Docker:{"\n"}
                  docker compose up -d{"\n"}
                  npx prisma db push{"\n"}
                  npx tsx prisma/seed.ts
                </code>
              </pre>
            </div>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. HERO COMMAND HEADER */}
      <PageHeader
        title="Revenue Recovery Command Center"
        description="AI-assisted recovery of failed payments, governed by deterministic policy and human oversight."
        badge={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Recovery stream active
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              <Lock className="h-3 w-3 text-slate-500" />
              Test Mode
            </span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/recovery">
              <Button variant="primary" size="sm" className="shadow-xs">
                <span>View Recovery Queue</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href="/dashboard/analytics">
              <Button variant="outline" size="sm">
                <span>Full Analytics</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* 2. PRIMARY REVENUE IMPACT — DISTINCTIVE FINANCIAL HERO BOARD */}
      <div className="relative overflow-hidden rounded-app border border-emerald-200/90 bg-gradient-to-br from-emerald-950/5 via-surface-raised to-indigo-950/5 p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
          {/* Dominant Hero Metric: Recovered Revenue */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </div>
              <span className="text-[11.5px] font-bold uppercase tracking-wider text-emerald-800">
                Restored Business Revenue
              </span>
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-[38px] sm:text-[44px] font-extrabold tracking-tight text-emerald-950 leading-none">
                  {formatINR(summary.revenueRecovered)}
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <ArrowUpRight className="h-3 w-3" />
                  +18.4%
                </span>
              </div>
              <p className="mt-2 text-[12.5px] text-ink-muted leading-relaxed">
                Simulated recovery value from otherwise-at-risk failed payments.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <div className="rounded-app border border-emerald-200 bg-emerald-50/60 px-3 py-1.5">
                <span className="text-[10.5px] font-semibold text-emerald-800 uppercase tracking-wider">
                  Success Count
                </span>
                <p className="tabular text-[14px] font-bold text-emerald-950">
                  {analytics.successfulRecoveries} Recoveries
                </p>
              </div>
              <div className="rounded-app border border-line bg-surface-raised px-3 py-1.5">
                <span className="text-[10.5px] font-semibold text-ink-faint uppercase tracking-wider">
                  Avg Ticket
                </span>
                <p className="tabular text-[14px] font-bold text-ink">
                  {formatINR(analytics.averageRecoveredAmount)}
                </p>
              </div>
            </div>
          </div>

          {/* Supporting Core Financial Metrics */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Metric 2: Transaction Resolution Rate */}
            <div className="rounded-app border border-line bg-surface-raised p-4 shadow-2xs transition-all hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Transaction Resolution Rate
                </span>
                <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div className="mt-2">
                <span className="tabular text-[24px] font-bold tracking-tight text-ink">
                  {formatPercent(summary.recoveryRate)}
                </span>
                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  High yield conversion
                </p>
              </div>
              <div className="mt-3 border-t border-line pt-2 text-[10.5px] text-ink-faint">
                By failed payment volume count
              </div>
            </div>

            {/* Metric 3: Revenue at Risk */}
            <div className="rounded-app border border-line bg-surface-raised p-4 shadow-2xs transition-all hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                  Revenue at Risk
                </span>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              </div>
              <div className="mt-2">
                <span className="tabular text-[24px] font-bold tracking-tight text-ink">
                  {formatINR(analytics.revenueAtRisk)}
                </span>
                <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                  {summary.failedPaymentsCount} failed events
                </p>
              </div>
              <div className="mt-3 border-t border-line pt-2 text-[10.5px] text-ink-faint">
                Total triaged failure value
              </div>
            </div>

            {/* Metric 4: Expected Recoverable */}
            <div className="rounded-app border border-line bg-surface-raised p-4 shadow-2xs transition-all hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                  Projected Yield
                </span>
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              </div>
              <div className="mt-2">
                <span className="tabular text-[24px] font-bold tracking-tight text-indigo-950">
                  {formatINR(analytics.expectedRecoverable)}
                </span>
                <p className="text-[11px] text-indigo-700 font-medium mt-0.5">
                  {analytics.recoveryPipelineCount} active actions
                </p>
              </div>
              <div className="mt-3 border-t border-line pt-2 text-[10.5px] text-ink-faint">
                AI calibrated expectation
              </div>
            </div>
          </div>
        </div>

        {/* Quick Operational Footprint Strip */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-200/80 pt-4 text-[11.5px]">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-ink-faint" />
            <span className="text-ink-muted">Total Indexed:</span>
            <span className="tabular font-bold text-ink">{summary.totalPaymentsCount.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-indigo-600" />
            <span className="text-ink-muted">AI Interventions:</span>
            <span className="tabular font-bold text-indigo-700">{summary.aiInterventionsCount.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-ink-muted">Pending Approvals:</span>
            <span className="tabular font-bold text-amber-800">{analytics.pendingApprovalCount.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-ink-muted">Policy Gate:</span>
            <span className="font-bold text-emerald-700">85% Enforced</span>
          </div>
        </div>
      </div>

      {/* 3. AI RECOVERY ENGINE — CONNECTED 6-STAGE INTELLIGENT DECISION GRAPH */}
      <Panel>
        <PanelHeader className="bg-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-white shadow-2xs">
              <Workflow className="h-3.5 w-3.5" />
            </div>
            <div>
              <PanelTitle>AI Decision &amp; Governance Pipeline</PanelTitle>
              <PanelDescription>
                How RazorRecover processes, gates, and safely executes failed payment recoveries.
              </PanelDescription>
            </div>
          </div>
          <Badge tone="ai" dot>
            Deterministic Oversight
          </Badge>
        </PanelHeader>
        <PanelBody className="space-y-5 p-5">
          {/* Connected Graph Nodes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Node 1 */}
            <div className="relative rounded-app border border-line bg-surface/70 p-3.5 transition-all hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-ink-faint tracking-wider">01. INGESTION</span>
                <span className="rounded bg-slate-200/80 px-1 py-0.2 text-[9px] font-bold text-slate-700 uppercase">
                  HMAC SHA256
                </span>
              </div>
              <h4 className="mt-2 text-[13px] font-bold text-ink flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-600" />
                Detect
              </h4>
              <p className="mt-1 text-[11px] text-ink-muted leading-relaxed">
                Webhook signature validated &amp; idempotent event recorded in PostgreSQL.
              </p>
            </div>

            {/* Node 2 */}
            <div className="relative rounded-app border border-indigo-200/80 bg-indigo-50/30 p-3.5 transition-all hover:border-indigo-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-700 tracking-wider">02. LLM REASONING</span>
                <span className="rounded bg-indigo-100 px-1 py-0.2 text-[9px] font-bold text-indigo-800 uppercase">
                  Advisory Only
                </span>
              </div>
              <h4 className="mt-2 text-[13px] font-bold text-indigo-950 flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-indigo-600" />
                Diagnose
              </h4>
              <p className="mt-1 text-[11px] text-indigo-950 leading-relaxed">
                Claude 3.7 Sonnet &amp; Gemini Flash classify root-cause &amp; transient factors.
              </p>
            </div>

            {/* Node 3 */}
            <div className="relative rounded-app border border-line bg-surface/70 p-3.5 transition-all hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-ink-faint tracking-wider">03. SCORING</span>
                <span className="rounded bg-slate-200/80 px-1 py-0.2 text-[9px] font-bold text-slate-700 uppercase">
                  Confidence
                </span>
              </div>
              <h4 className="mt-2 text-[13px] font-bold text-ink flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                Predict
              </h4>
              <p className="mt-1 text-[11px] text-ink-muted leading-relaxed">
                Computes recovery probability and suggests optimal remediation action.
              </p>
            </div>

            {/* Node 4 (AUTHORITATIVE GATE) */}
            <div className="relative rounded-app border-2 border-indigo-500/80 bg-indigo-50/70 p-3.5 shadow-2xs ring-1 ring-indigo-200">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-indigo-800 tracking-wider">04. POLICY GATE</span>
                <span className="rounded bg-indigo-600 px-1.5 py-0.2 text-[9px] font-bold text-white uppercase">
                  Authoritative
                </span>
              </div>
              <h4 className="mt-2 text-[13px] font-bold text-indigo-950 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-700" />
                Decide
              </h4>
              <p className="mt-1 text-[11px] text-indigo-950 font-medium leading-relaxed">
                Deterministic policy enforces 85% confidence &amp; max 3 retry limits.
              </p>
            </div>

            {/* Node 5 */}
            <div className="relative rounded-app border border-amber-200/80 bg-amber-50/40 p-3.5 transition-all hover:border-amber-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-800 tracking-wider">05. GOVERNANCE</span>
                <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800 uppercase">
                  Operator
                </span>
              </div>
              <h4 className="mt-2 text-[13px] font-bold text-amber-950 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                Approve
              </h4>
              <p className="mt-1 text-[11px] text-amber-950 leading-relaxed">
                High-risk or low-confidence actions route to human approval queue.
              </p>
            </div>

            {/* Node 6 */}
            <div className="relative rounded-app border border-emerald-200/90 bg-emerald-50/50 p-3.5 transition-all hover:border-emerald-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-800 tracking-wider">06. EXECUTION</span>
                <span className="rounded bg-emerald-100 px-1 py-0.2 text-[9px] font-bold text-emerald-800 uppercase">
                  Test Mode
                </span>
              </div>
              <h4 className="mt-2 text-[13px] font-bold text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Recover
              </h4>
              <p className="mt-1 text-[11px] text-emerald-950 leading-relaxed font-medium">
                Bounded sandbox execution with merchant-scoped PostgreSQL audit logging.
              </p>
            </div>
          </div>

          {/* Safety Statement Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-app border border-slate-800 bg-slate-950 px-4 py-3 text-white shadow-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-[12.5px] text-slate-300">
                <strong className="text-white font-bold">Safety Guarantee:</strong> AI recommends. Deterministic policy decides. Humans approve when required. Recovery execution is strictly bounded.
              </p>
            </div>
            <Link
              href="/dashboard/agent"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-300 hover:text-white transition-colors shrink-0"
            >
              <span>View Agent Specs</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </PanelBody>
      </Panel>

      {/* 4. PERFORMANCE VISUAL & CATEGORY YIELD (2-COLUMN GRID) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left (7 Cols): Recovery Performance Trend Chart */}
        <Panel className="lg:col-span-7">
          <PanelHeader>
            <div>
              <PanelTitle>Recovery Performance Over Time</PanelTitle>
              <PanelDescription>
                Restored capital compared to incoming failure volume.
              </PanelDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Recovered
              </span>
              <span className="flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
                <span className="h-2 w-2 rounded-full bg-amber-600" />
                At Risk
              </span>
            </div>
          </PanelHeader>
          <PanelBody className="p-4">
            <DashboardTrendChart trend={analytics.trend} />
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[11.5px]">
              <span className="text-ink-faint">Timeseries computed from PostgreSQL audit records</span>
              <Link href="/dashboard/analytics" className="font-semibold text-indigo-600 hover:underline">
                Explore Analytics Dashboard &rarr;
              </Link>
            </div>
          </PanelBody>
        </Panel>

        {/* Right (5 Cols): Recovery Yield by Category */}
        <Panel className="lg:col-span-5">
          <PanelHeader>
            <div>
              <PanelTitle>Recovery Yield by Failure Type</PanelTitle>
              <PanelDescription>
                Which failure categories yield the highest recovery?
              </PanelDescription>
            </div>
            <Badge tone="recovery">Live Yield</Badge>
          </PanelHeader>
          <PanelBody className="p-0">
            {analytics.byCategory.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-ink-muted">
                No category records available.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {analytics.byCategory.slice(0, 4).map((item) => (
                  <div key={item.category} className="p-3.5 space-y-2 hover:bg-surface/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[12.5px] font-bold text-ink">
                          {item.category.replace(/_/g, " ")}
                        </span>
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                          {item.opportunities} cases
                        </span>
                      </div>
                      <span className="text-[12px] font-bold text-emerald-700 tabular">
                        {item.recoveryRate.toFixed(0)}% Yield
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-ink-muted">
                      <span>At Risk: <strong className="text-ink">{formatINR(item.revenueAtRisk)}</strong></span>
                      <span>Recovered: <strong className="text-emerald-700">{formatINR(item.recoveredRevenue)}</strong></span>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all"
                        style={{ width: `${Math.min(100, item.recoveryRate)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelBody>
        </Panel>
      </div>

      {/* 5. TRUST & GOVERNANCE MATRIX & RECENT RECOVERY ACTIVITY */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left (4 Cols): Enterprise Governance Controls */}
        <Panel className="lg:col-span-4">
          <PanelHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <PanelTitle>Governance Controls</PanelTitle>
            </div>
            <Badge tone="recovery">Enforced</Badge>
          </PanelHeader>
          <PanelBody className="space-y-3 p-4 text-[12px]">
            <div className="rounded-app border border-line bg-surface/50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">AI Advisory Boundary</span>
                <Badge tone="ai">Non-Binding</Badge>
              </div>
              <p className="text-[11px] text-ink-muted">
                LLMs provide root-cause diagnostics; zero autonomous fund transfer authority.
              </p>
            </div>

            <div className="rounded-app border border-line bg-surface/50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">Deterministic Policy Gate</span>
                <Badge tone="info">Authoritative</Badge>
              </div>
              <p className="text-[11px] text-ink-muted">
                Hard rule engine evaluates merchant thresholds before any action is scheduled.
              </p>
            </div>

            <div className="rounded-app border border-line bg-surface/50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">Confidence &amp; Retry Limits</span>
                <span className="font-mono font-bold text-ink text-[11.5px]">&ge; 85% &bull; Max 3</span>
              </div>
              <p className="text-[11px] text-ink-muted">
                Low confidence actions route to human approval; retry cap prevents customer fatigue.
              </p>
            </div>

            <div className="rounded-app border border-line bg-surface/50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">Audit Trail Scope</span>
                <Badge tone="neutral">Merchant Scoped</Badge>
              </div>
              <p className="text-[11px] text-ink-muted">
                Every event, diagnostic score, policy check, and outcome is logged in PostgreSQL.
              </p>
            </div>
          </PanelBody>
        </Panel>

        {/* Right (8 Cols): Recent AI Decisions & Recovery Activity */}
        <Panel className="lg:col-span-8">
          <PanelHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-white shadow-2xs">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div>
                <PanelTitle>Recent AI Diagnoses &amp; Triage Feed</PanelTitle>
                <PanelDescription>
                  Live evaluated failed payment events stored in PostgreSQL.
                </PanelDescription>
              </div>
            </div>
            <Link href="/dashboard/recovery">
              <Button variant="ghost" size="sm" className="text-[12px]">
                <span>Manage Queue</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </PanelHeader>
          <PanelBody className="p-0">
            {recentDecisions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-ink-muted">
                <AlertTriangle className="h-8 w-8 text-ink-faint" />
                <p className="mt-2 text-[13.5px] font-semibold text-ink">No AI analyses recorded yet</p>
                <p className="text-[12px] text-ink-muted">Trigger a payment failure webhook to generate live triage records.</p>
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Payment &amp; Customer</TH>
                    <TH>Amount</TH>
                    <TH>AI Recommendation</TH>
                    <TH>Confidence</TH>
                    <TH>Odds</TH>
                    <TH>Risk</TH>
                    <TH>Timestamp</TH>
                  </TR>
                </THead>
                <TBody>
                  {recentDecisions.map((decision) => (
                    <TR key={decision.id}>
                      <TD>
                        <div className="flex flex-col">
                          <span className="font-bold text-ink">{decision.customerName}</span>
                          <span className="font-mono text-[10.5px] text-ink-faint">
                            {truncateId(decision.providerPaymentId || decision.paymentId, 16)}
                          </span>
                        </div>
                      </TD>
                      <TD className="tabular font-bold text-ink">
                        {formatINR(decision.amount)}
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            decision.recommendedAction === "RETRY_PAYMENT"
                              ? "recovery"
                              : decision.recommendedAction === "SEND_REMINDER"
                              ? "ai"
                              : decision.recommendedAction === "REQUEST_PAYMENT_METHOD_UPDATE"
                              ? "info"
                              : "risk"
                          }
                        >
                          {decision.recommendedAction.replace(/_/g, " ")}
                        </Badge>
                      </TD>
                      <TD className="tabular font-medium text-slate-700">
                        {(decision.confidence * 100).toFixed(0)}%
                      </TD>
                      <TD className="tabular font-bold text-emerald-700">
                        {(decision.recoveryProbability * 100).toFixed(0)}%
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            decision.riskLevel === "LOW"
                              ? "recovery"
                              : decision.riskLevel === "MEDIUM"
                              ? "risk"
                              : "danger"
                          }
                        >
                          {decision.riskLevel}
                        </Badge>
                      </TD>
                      <TD className="text-[11px] text-ink-muted tabular">
                        {formatDateTime(decision.createdAt)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}


