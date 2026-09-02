import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getCustomers } from "@/server/services/customerService";

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
    const hasFailures = searchParams.get("hasFailures") === "true";

    const data = await getCustomers(user.merchantId, {
      page,
      pageSize,
      search,
      hasFailures,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve customers" },
      { status: 500 }
    );
  }
}
