import * as React from "react";
import { getCurrentUser } from "@/server/auth";
import { getRecoveryActions, getRecoverySummary } from "@/server/services/recoveryService";
import { PageHeader } from "@/components/layout/page-header";
import { RecoveryClient } from "./recovery-client";
import { Panel } from "@/components/ui/panel";
import { Database } from "lucide-react";

export default async function RecoveryPage() {
  const user = await getCurrentUser();
  const merchantId = user?.merchantId || "merch_kaveri_demo_01";

  let actionsData: Awaited<ReturnType<typeof getRecoveryActions>> = { recoveryActions: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };
  let summary = {
    totalActions: 0,
    executed: 0,
    pendingApproval: 0,
    failed: 0,
    totalRecoveredAmount: 0,
  };
  let dbError: string | null = null;

  try {
    const [actions, sum] = await Promise.all([
      getRecoveryActions(merchantId, { pageSize: 50 }),
      getRecoverySummary(merchantId),
    ]);
    actionsData = actions;
    summary = sum;
  } catch (err) {
    console.error("Failed to load recovery actions from PostgreSQL:", err);
    dbError = err instanceof Error ? err.message : "Database connection offline";
  }

  return (
    <>
      <PageHeader
        title="Recovery Operations"
        description="Autonomous revenue recovery queue, human-in-the-loop approvals, and execution metrics."
      />

      {dbError ? (
        <Panel className="border-danger/30 bg-danger-soft/30 p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Database className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-[16px] font-semibold text-ink">
              PostgreSQL Database Offline
            </h2>
            <p className="mt-2 max-w-lg text-[13.5px] text-ink-muted">
              Start your local PostgreSQL instance and apply the seed dataset to view the recovery operations queue.
            </p>
          </div>
        </Panel>
      ) : (
        <React.Suspense
          fallback={
            <Panel className="p-12 text-center text-ink-faint">
              Loading recovery queue…
            </Panel>
          }
        >
          <RecoveryClient
            initialActions={actionsData.recoveryActions as unknown as Parameters<typeof RecoveryClient>[0]["initialActions"]}
            summary={summary}
          />
        </React.Suspense>
      )}
    </>
  );
}
