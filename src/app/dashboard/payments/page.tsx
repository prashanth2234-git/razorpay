import * as React from "react";
import { getCurrentUser } from "@/server/auth";
import { getPayments } from "@/server/services/paymentService";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentsClient, PaymentRecord } from "./payments-client";
import { PaymentStatus, PaymentMethod, FailureCategory } from "@prisma/client";
import { Panel } from "@/components/ui/panel";
import { Database } from "lucide-react";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    method?: string;
    failureCategory?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const merchantId = user?.merchantId || "merch_kaveri_demo_01";

  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const pageSize = parseInt(params.pageSize || "15", 10);
  const search = params.search || undefined;
  const status = params.status as PaymentStatus | undefined;
  const method = params.method as PaymentMethod | undefined;
  const failureCategory = params.failureCategory as FailureCategory | undefined;

  let data: Awaited<ReturnType<typeof getPayments>> = { payments: [], total: 0, page: 1, pageSize: 15, totalPages: 0 };
  let dbError: string | null = null;

  try {
    data = await getPayments(merchantId, {
      page,
      pageSize,
      search,
      status,
      method,
      failureCategory,
    });
  } catch (err) {
    console.error("Failed to load payments from database:", err);
    dbError = err instanceof Error ? err.message : "Database connection offline";
  }

  return (
    <>
      <PageHeader
        title="Payments Operations"
        description="Real-time transaction stream, failure diagnoses, and recovery status."
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
              Start your local PostgreSQL instance and apply the seed dataset to view payment operations.
            </p>
          </div>
        </Panel>
      ) : (
        <React.Suspense
          fallback={
            <Panel className="p-12 text-center text-ink-faint">
              Loading payment records…
            </Panel>
          }
        >
          <PaymentsClient
            initialPayments={data.payments as unknown as PaymentRecord[]}
            total={data.total}
            page={data.page}
            pageSize={data.pageSize}
            totalPages={data.totalPages}
            currentStatus={params.status || ""}
            currentMethod={params.method || ""}
            currentSearch={params.search || ""}
          />
        </React.Suspense>
      )}
    </>
  );
}
