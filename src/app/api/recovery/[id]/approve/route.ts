import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { canPerformOperationalActions } from "@/server/permissions";
import { approveRecoveryAction } from "@/server/recovery/executor";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canPerformOperationalActions(user.role)) {
      return NextResponse.json(
        { error: `Forbidden: User role ${user.role} cannot approve recovery actions.` },
        { status: 403 }
      );
    }

    const { id } = await params;
    const action = await approveRecoveryAction(user.merchantId, user.id, id);

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("POST /api/recovery/:id/approve error:", error);
    const message = error instanceof Error ? error.message : "Failed to approve recovery action";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
