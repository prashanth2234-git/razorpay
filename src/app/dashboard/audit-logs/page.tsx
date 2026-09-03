import { getCurrentUser } from "@/server/auth";
import { getAuditLogs } from "@/server/audit/audit-service";
import { PageHeader } from "@/components/layout/page-header";
import { AuditLogsClient } from "./audit-logs-client";
import { redirect } from "next/navigation";
import { AuditLogsResponse, ActorType, AuditEventType } from "@/types/client";

export default async function AuditLogsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch initial audit logs for authenticated merchant
  const rawData = await getAuditLogs(user.merchantId, {
    page: 1,
    pageSize: 25,
  });

  // Ensure clean JSON serialization across Server -> Client boundary
  const initialData: AuditLogsResponse = {
    total: rawData.total,
    page: rawData.page,
    pageSize: rawData.pageSize,
    totalPages: rawData.totalPages,
    auditLogs: rawData.auditLogs.map((log) => ({
      id: log.id,
      merchantId: log.merchantId,
      userId: log.userId,
      paymentId: log.paymentId,
      recoveryActionId: log.recoveryActionId,
      actorType: log.actorType as ActorType,
      eventType: log.eventType as AuditEventType,
      description: log.description,
      metadata: (log.metadata as Record<string, unknown>) || null,
      createdAt: log.createdAt.toISOString(),
      user: log.user
        ? {
            id: log.user.id,
            name: log.user.name,
            email: log.user.email,
            role: log.user.role,
          }
        : null,
      payment: log.payment
        ? {
            id: log.payment.id,
            providerPaymentId: log.payment.providerPaymentId,
            amount: log.payment.amount,
            currency: log.payment.currency,
            status: log.payment.status,
            failureCategory: log.payment.failureCategory,
            customer: log.payment.customer
              ? {
                  name: log.payment.customer.name,
                  email: log.payment.customer.email,
                }
              : null,
          }
        : null,
      recoveryAction: log.recoveryAction
        ? {
            id: log.recoveryAction.id,
            actionType: log.recoveryAction.actionType,
            status: log.recoveryAction.status,
            expectedRecoveryAmount: log.recoveryAction.expectedRecoveryAmount,
          }
        : null,
    })),
  };

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Immutable record of every payment failure, AI recommendation, policy gate, and operator action."
      />
      <AuditLogsClient initialData={initialData} />
    </>
  );
}
