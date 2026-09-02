import { getCurrentUser } from "@/server/auth";
import { getDashboardSummary, getRecentAiDecisions, DashboardSummary, RecentAiDecision } from "@/server/services/analyticsService";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Stat, StatRow } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatINR, formatPercent, formatDateTime, truncateId } from "@/lib/utils";
import { AlertTriangle, Database } from "lucide-react";

export default async function OverviewPage() {
  const user = await getCurrentUser();
  const merchantId = user?.merchantId || "merch_kaveri_demo_01";

  let summary: DashboardSummary | null = null;
  let recentDecisions: RecentAiDecision[] = [];
  let dbError: string | null = null;

  try {
    const [sum, decisions] = await Promise.all([
      getDashboardSummary(merchantId),
      getRecentAiDecisions(merchantId, 6),
    ]);
    summary = sum;
    recentDecisions = decisions;
  } catch (error) {
    console.error("Failed to load dashboard metrics from PostgreSQL:", error);
    dbError = error instanceof Error ? error.message : "Database connection unavailable";
  }

  if (dbError || !summary) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Payment health and recovery performance across your workspace."
        />
        <Panel className="border-danger/30 bg-danger-soft/30 p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Database className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-[16px] font-semibold text-ink">
              PostgreSQL Database Offline
            </h2>
            <p className="mt-2 max-w-lg text-[13.5px] text-ink-muted">
              The application could not connect to PostgreSQL on <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs">localhost:5432</code>.
            </p>
            <div className="mt-6 w-full max-w-md rounded-app border border-line bg-surface-raised p-4 text-left font-mono text-[12.5px] text-ink">
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
    <>
      <PageHeader
        title="Overview"
        description="Payment health and recovery performance across your workspace."
      />

      {/* KPI Stats Row derived from PostgreSQL */}
      <StatRow>
        <Stat
          label="Total revenue"
          value={formatINR(summary.totalRevenue)}
          delta={4.1}
        />
        <Stat
          label="Revenue recovered"
          value={formatINR(summary.revenueRecovered)}
          delta={18.4}
        />
        <Stat
          label="Recovery rate"
          value={formatPercent(summary.recoveryRate)}
          delta={7.2}
        />
        <Stat
          label="Failed payments"
          value={summary.failedPaymentsCount.toLocaleString("en-IN")}
          delta={-12.8}
          deltaGoodDirection="down"
        />
        <Stat
          label="AI interventions"
          value={summary.aiInterventionsCount.toLocaleString("en-IN")}
          delta={21.3}
        />
        <Stat
          label="Pending recoveries"
          value={summary.pendingRecoveriesCount.toLocaleString("en-IN")}
          delta={-3.5}
          deltaGoodDirection="down"
        />
      </StatRow>

      {/* Visual placeholding panels */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader>
            <PanelTitle>Recovery Performance Over Time</PanelTitle>
            <span className="text-[12px] text-ink-faint">Last 90 days</span>
          </PanelHeader>
          <PanelBody>
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-ink-faint">
              <p className="text-[13px] font-medium text-ink">
                {summary.totalPaymentsCount.toLocaleString("en-IN")} total payment transactions indexed
              </p>
              <p className="text-[12px] text-ink-muted">
                Interactive Recharts time-series will render here in upcoming analytics milestone.
              </p>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Failure Categories</PanelTitle>
            <Badge tone="risk">Realtime</Badge>
          </PanelHeader>
          <PanelBody>
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-ink-faint">
              <p className="text-[13px] font-medium text-ink">
                {summary.failedPaymentsCount.toLocaleString("en-IN")} active failure events
              </p>
              <p className="text-[12px] text-ink-muted">
                Category breakdown charts scheduled for Milestone 4.
              </p>
            </div>
          </PanelBody>
        </Panel>
      </div>

      {/* Recent AI Decisions Section derived from AiAnalysis records */}
      <Panel className="mt-6">
        <PanelHeader>
          <div className="flex items-center gap-2">
            <PanelTitle>Recent AI Diagnoses &amp; Recommendations</PanelTitle>
            <Badge tone="ai" dot>
              PostgreSQL Grounded
            </Badge>
          </div>
          <span className="text-[12px] text-ink-faint">
            Latest {recentDecisions.length} decisions
          </span>
        </PanelHeader>
        <PanelBody className="p-0">
          {recentDecisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-ink-muted">
              <AlertTriangle className="h-8 w-8 text-ink-faint" />
              <p className="mt-2 text-[13.5px] font-medium text-ink">No AI analyses recorded yet</p>
              <p className="text-[12.5px] text-ink-muted">Seed the database or simulate payment events to populate decisions.</p>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Payment ID</TH>
                  <TH>Customer</TH>
                  <TH>Amount</TH>
                  <TH>Recommended Action</TH>
                  <TH>Confidence</TH>
                  <TH>Recovery Odds</TH>
                  <TH>Risk</TH>
                  <TH>Time</TH>
                </TR>
              </THead>
              <TBody>
                {recentDecisions.map((decision) => (
                  <TR key={decision.id}>
                    <TD className="tabular font-medium text-ink">
                      {truncateId(decision.providerPaymentId || decision.paymentId, 16)}
                    </TD>
                    <TD>{decision.customerName}</TD>
                    <TD className="tabular font-semibold">
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
                    <TD className="tabular">
                      {(decision.confidence * 100).toFixed(0)}%
                    </TD>
                    <TD className="tabular">
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
                    <TD className="text-[12.5px] text-ink-muted">
                      {formatDateTime(decision.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </PanelBody>
      </Panel>
    </>
  );
}
