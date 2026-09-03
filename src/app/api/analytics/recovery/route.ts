import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getRecoveryAnalytics } from "@/server/analytics/recovery-analytics";
import { FailureCategory, RecoveryActionType } from "@/types/client";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const rawCategory = searchParams.get("failureCategory");
    const rawActionType = searchParams.get("actionType");

    // Validate enum params if supplied
    const failureCategory =
      rawCategory && (Object.values(FailureCategory) as string[]).includes(rawCategory)
        ? (rawCategory as FailureCategory)
        : undefined;

    const actionType =
      rawActionType && (Object.values(RecoveryActionType) as string[]).includes(rawActionType)
        ? (rawActionType as RecoveryActionType)
        : undefined;

    // Strict merchant scoping: always use authenticated user.merchantId
    const analyticsData = await getRecoveryAnalytics(user.merchantId, {
      startDate,
      endDate,
      failureCategory,
      actionType,
    });

    return NextResponse.json(analyticsData);
  } catch (error) {
    console.error("GET /api/analytics/recovery error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve recovery analytics" },
      { status: 500 }
    );
  }
}
