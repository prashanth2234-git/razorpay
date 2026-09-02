import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { canPerformOperationalActions } from "@/server/permissions";
import { rejectRecoveryAction } from "@/server/recovery/executor";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canPerformOperationalActions(user.role)) {
      return NextResponse.json(
        { error: `Forbidden: User role ${user.role} cannot reject recovery actions.` },
        { status: 403 }
      );
    }

    const { id } = await params;
    let body: { reason?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body allowed
    }

    const action = await rejectRecoveryAction(user.merchantId, user.id, id, body.reason);

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("POST /api/recovery/:id/reject error:", error);
    const message = error instanceof Error ? error.message : "Failed to reject recovery action";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
