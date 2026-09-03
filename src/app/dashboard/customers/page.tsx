import { getCurrentUser } from "@/server/auth";
import { getCustomers } from "@/server/services/customerService";
import { PageHeader } from "@/components/layout/page-header";
import { CustomersClient } from "./customers-client";

export default async function CustomersPage() {
  const user = await getCurrentUser();
  const merchantId = user?.merchantId || "merch_kaveri_demo_01";

  const rawData = await getCustomers(merchantId, { page: 1, pageSize: 15 });

  const initialData = {
    customers: rawData.customers.map((c) => ({
      id: c.id,
      merchantId: c.merchantId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      lifetimeValue: c.lifetimeValue,
      successfulPaymentCount: c.successfulPaymentCount,
      failedPaymentCount: c.failedPaymentCount,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    total: rawData.total,
    page: rawData.page,
    pageSize: rawData.pageSize,
    totalPages: rawData.totalPages,
  };

  return (
    <>
      <PageHeader
        title="Customers"
        description="Payment behavior, transaction records, and recovery metrics by customer."
      />
      <CustomersClient initialData={initialData} />
    </>
  );
}

