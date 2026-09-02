import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface GetCustomersOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  hasFailures?: boolean;
}

export async function getCustomers(merchantId: string, options: GetCustomersOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.CustomerWhereInput = {
    merchantId, // strictly merchant-scoped
    ...(options.hasFailures && { failedPaymentCount: { gt: 0 } }),
    ...(options.search && {
      OR: [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { phone: { contains: options.search, mode: "insensitive" } },
      ],
    }),
  };

  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { lifetimeValue: "desc" },
    }),
  ]);

  return {
    customers,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getCustomerById(merchantId: string, customerId: string) {
  return db.customer.findFirst({
    where: {
      id: customerId,
      merchantId, // strictly merchant-scoped
    },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          aiAnalyses: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
}
