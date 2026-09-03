import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { PageHeader } from "@/components/layout/page-header";
import { getRecoveryAnalytics } from "@/server/analytics/recovery-analytics";
import { AnalyticsClient } from "./analytics-client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Load real server-side analytics scoped strictly to merchant
  const analyticsData = await getRecoveryAnalytics(user.merchantId);

  // Clean serialization across Server/Client SSR boundary
  const serializedData = JSON.parse(JSON.stringify(analyticsData));

  return (
    <>
      <PageHeader
        title="Recovery Analytics"
        description="Comprehensive real-time financial impact, recovery rates, and autonomous pipeline metrics."
      />
      <AnalyticsClient initialData={serializedData} />
    </>
  );
}
