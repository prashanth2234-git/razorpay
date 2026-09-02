import { db } from "@/lib/db";
import { PaymentStatus, PaymentMethod, FailureCategory, Prisma } from "@prisma/client";

export interface GetPaymentsOptions {
  page?: number;
  pageSize?: number;
  status?: PaymentStatus;
  method?: PaymentMethod;
  failureCategory?: FailureCategory;
  customerId?: string;
  search?: string;
}

export async function getPayments(merchantId: string, options: GetPaymentsOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.PaymentWhereInput = {
    merchantId, // strictly merchant-scoped
    ...(options.status && { status: options.status }),
    ...(options.method && { method: options.method }),
    ...(options.failureCategory && { failureCategory: options.failureCategory }),
    ...(options.customerId && { customerId: options.customerId }),
    ...(options.search && {
      OR: [
        { providerPaymentId: { contains: options.search, mode: "insensitive" } },
        { description: { contains: options.search, mode: "insensitive" } },
        { customer: { name: { contains: options.search, mode: "insensitive" } } },
        { customer: { email: { contains: options.search, mode: "insensitive" } } },
      ],
    }),
  };

  const [total, payments] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        aiAnalyses: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            diagnosis: true,
            confidence: true,
            recoveryProbability: true,
            recommendedAction: true,
            riskLevel: true,
          },
        },
        recoveryActions: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            actionType: true,
            status: true,
            expectedRecoveryAmount: true,
          },
        },
      },
    }),
  ]);

  return {
    payments,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getPaymentById(merchantId: string, paymentId: string) {
  return db.payment.findFirst({
    where: {
      id: paymentId,
      merchantId, // strictly merchant-scoped
    },
    include: {
      customer: true,
      attempts: {
        orderBy: { attemptNumber: "asc" },
      },
      failures: {
        orderBy: { occurredAt: "desc" },
      },
      aiAnalyses: {
        orderBy: { createdAt: "desc" },
      },
      recoveryActions: {
        include: {
          attempts: true,
          approvedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}
