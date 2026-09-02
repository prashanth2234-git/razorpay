import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const action = await db.recoveryAction.findFirst({
      where: {
        id,
        payment: { merchantId: user.merchantId }, // strictly merchant-scoped
      },
      include: {
        payment: {
          include: {
            customer: true,
            attempts: { orderBy: { attemptNumber: "desc" } },
            failures: { orderBy: { occurredAt: "desc" } },
          },
        },
        aiAnalysis: true,
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
        attempts: {
          orderBy: { attemptNumber: "desc" },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!action) {
      return NextResponse.json({ error: "Recovery action not found" }, { status: 404 });
    }

    return NextResponse.json(action);
  } catch (error) {
    console.error("GET /api/recovery/:id error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve recovery action" },
      { status: 500 }
    );
  }
}
