import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getRecoveryActions, getRecoverySummary } from "@/server/services/recoveryService";
import { RecoveryStatus, RecoveryActionType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const status = searchParams.get("status") as RecoveryStatus | undefined;
    const actionType = searchParams.get("actionType") as RecoveryActionType | undefined;
    const includeSummary = searchParams.get("includeSummary") === "true";

    const [actionsData, summary] = await Promise.all([
      getRecoveryActions(user.merchantId, {
        page,
        pageSize,
        status,
        actionType,
      }),
      includeSummary ? getRecoverySummary(user.merchantId) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ...actionsData,
      ...(summary && { summary }),
    });
  } catch (error) {
    console.error("GET /api/recovery error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve recovery actions" },
      { status: 500 }
    );
  }
}
