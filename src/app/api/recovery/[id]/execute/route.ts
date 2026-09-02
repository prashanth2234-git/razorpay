import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { canPerformOperationalActions } from "@/server/permissions";
import { executeRecoveryAction } from "@/server/recovery/executor";

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
        { error: `Forbidden: User role ${user.role} cannot execute recovery actions.` },
        { status: 403 }
      );
    }

    const { id } = await params;
    const result = await executeRecoveryAction(user.merchantId, user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/recovery/:id/execute error:", error);
    const message = error instanceof Error ? error.message : "Failed to execute recovery action";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
