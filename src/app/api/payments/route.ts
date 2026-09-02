import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getPayments } from "@/server/services/paymentService";
import { PaymentStatus, PaymentMethod, FailureCategory } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") as PaymentStatus | undefined;
    const method = searchParams.get("method") as PaymentMethod | undefined;
    const failureCategory = searchParams.get("failureCategory") as FailureCategory | undefined;

    const data = await getPayments(user.merchantId, {
      page,
      pageSize,
      search,
      status,
      method,
      failureCategory,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/payments error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve payments" },
      { status: 500 }
    );
  }
}
