import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getDashboardSummary, getRecentAiDecisions } from "@/server/services/analyticsService";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [summary, recentDecisions] = await Promise.all([
      getDashboardSummary(user.merchantId),
      getRecentAiDecisions(user.merchantId, 6),
    ]);

    return NextResponse.json({
      summary,
      recentDecisions,
    });
  } catch (error) {
    console.error("GET /api/dashboard/summary error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve dashboard metrics" },
      { status: 500 }
    );
  }
}
